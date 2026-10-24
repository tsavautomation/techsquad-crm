"""
WhatsApp Monitor - capture agent v2 (TechSquad CRM, F28-e).

Reads WhatsApp toast notifications on THIS Windows PC and forwards each new
message to the CRM app's ingest endpoint over HTTPS. The CRM does the rest
(conversations, AI reading, the board). This agent only reads notifications;
it never sends or changes anything in WhatsApp.

What is new in v2 (2026-10-23):
  - On start it forwards the notifications still stacked in the Windows
    notification center (up to backlog_hours old), instead of skipping them.
    The CRM ignores a repeat, so a restart never duplicates anything.
  - It polls every 0.5 s (was 3 s) and also wakes up on the Windows
    "notification changed" event, so a toast that a phone clears a moment
    later is still caught.
  - Each message carries the time Windows created the notification.
  - A heartbeat every 60 s tells the CRM the agent is alive (and how many
    messages wait in the outbox); the CRM warns the office when it stops.

Resilience: if the endpoint is unreachable, messages are queued to
outbox.jsonl and retried every 30 s, so nothing is lost while the CRM app or
the network is down.

Setup:
  - wa_agent.config.json next to this file, with crm_ingest_url and
    agent_secret (the same value as the CRM's WHATSAPP_AGENT_SECRET)
  - run start_wa_agent.bat (installs winsdk, then runs this)
"""
import asyncio
import json
import os
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

VERSION = "2.0"

try:
    from winsdk.windows.ui.notifications.management import (
        UserNotificationListener,
        UserNotificationListenerAccessStatus,
    )
    from winsdk.windows.ui.notifications import NotificationKinds
except Exception as e:  # pragma: no cover
    print("ERROR importing winsdk:", e)
    print("Run start_wa_agent.bat (it installs dependencies) first.")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "wa_agent.config.json")
OUTBOX = os.path.join(BASE, "outbox.jsonl")
LOG_PATH = os.path.join(BASE, "wa_agent.log")
STARTED_AT = datetime.now(timezone.utc)


def log(msg):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG_PATH):
        log("wa_agent.config.json not found. Copy the .example and fill it in.")
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    for key in ("crm_ingest_url", "agent_secret"):
        if not cfg.get(key) or "PASTE" in str(cfg.get(key)) or "YOUR" in str(cfg.get(key)):
            log(f"wa_agent.config.json: '{key}' is not filled in.")
            sys.exit(1)
    cfg.setdefault("poll_seconds", 0.5)
    cfg.setdefault("heartbeat_seconds", 60)
    cfg.setdefault("backlog_hours", 48)
    cfg.setdefault("device_name", os.environ.get("COMPUTERNAME", "pc"))
    # The heartbeat goes to the sibling endpoint of the ingest URL.
    cfg.setdefault("crm_heartbeat_url", cfg["crm_ingest_url"].rstrip("/").rsplit("/", 1)[0] + "/heartbeat")
    return cfg


# ---------- HTTP ----------
def post_json(cfg, url, payload, timeout=20):
    """Returns (ok, status_or_error)."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Agent-Secret", cfg["agent_secret"])
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return (200 <= resp.status < 300), resp.status
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()[:200]
        except Exception:
            pass
        return False, f"HTTP {e.code} {body}"
    except Exception as e:
        return False, str(e)


def outbox_count():
    try:
        with open(OUTBOX, encoding="utf-8") as f:
            return sum(1 for l in f if l.strip())
    except FileNotFoundError:
        return 0
    except Exception:
        return 0


def post_message(cfg, payload):
    """True if delivered now; otherwise queued to the outbox."""
    ok, info = post_json(cfg, cfg["crm_ingest_url"], payload)
    if ok:
        return True
    log(f"ingest failed ({info}); queued")
    try:
        with open(OUTBOX, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as e:
        log(f"outbox write error: {e}")
    return False


def flush_outbox(cfg):
    if not os.path.exists(OUTBOX):
        return
    try:
        with open(OUTBOX, encoding="utf-8") as f:
            pending = [json.loads(l) for l in f if l.strip()]
    except Exception as e:
        log(f"outbox read error: {e}")
        return
    if not pending:
        return
    still = []
    for p in pending:
        ok, _ = post_json(cfg, cfg["crm_ingest_url"], p)
        if not ok:
            still.append(p)
    try:
        if still:
            with open(OUTBOX, "w", encoding="utf-8") as f:
                for p in still:
                    f.write(json.dumps(p) + "\n")
        else:
            os.remove(OUTBOX)
            log(f"outbox drained ({len(pending)} sent).")
    except Exception as e:
        log(f"outbox rewrite error: {e}")


def heartbeat(cfg):
    ok, info = post_json(cfg, cfg["crm_heartbeat_url"], {
        "device": cfg["device_name"],
        "version": VERSION,
        "started_at": STARTED_AT.isoformat(),
        "pending": outbox_count(),
    }, timeout=10)
    if not ok:
        log(f"heartbeat failed ({info})")


# ---------- notifications ----------
def read_text_elements(notif):
    lines = []
    try:
        for binding in notif.notification.visual.bindings:
            for el in binding.get_text_elements():
                if el.text:
                    lines.append(el.text.strip())
    except Exception:
        pass
    return [l for l in lines if l]


def app_name(notif):
    try:
        return notif.app_info.display_info.display_name or ""
    except Exception:
        return ""


def created_at(notif):
    """When Windows created the toast (UTC), or now."""
    try:
        t = notif.creation_time
        if t is not None:
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            return t.astimezone(timezone.utc)
    except Exception:
        pass
    return datetime.now(timezone.utc)


def to_payload(cfg, n):
    if "whatsapp" not in app_name(n).lower():
        return None
    lines = read_text_elements(n)
    if not lines:
        return None
    chat = lines[0]
    body = "\n".join(lines[1:]).strip()
    if not body:
        return None
    return {
        "device": cfg["device_name"],
        "notif_id": int(n.id),
        "captured_at": created_at(n).isoformat(),
        "chat": chat,
        "sender": chat,
        "body": body,
    }


async def main():
    cfg = load_config()
    listener = UserNotificationListener.current
    status = await listener.request_access_async()
    if status != UserNotificationListenerAccessStatus.ALLOWED:
        log(f"Notification access not granted (status {status}). Settings > Privacy > Notifications: allow this app.")
        return

    log("=" * 56)
    log(f"WhatsApp capture agent v{VERSION} running.")
    log(f"device={cfg['device_name']} -> {cfg['crm_ingest_url']}")
    log(f"poll every {cfg['poll_seconds']} s, heartbeat every {cfg['heartbeat_seconds']} s, backlog {cfg['backlog_hours']} h")
    log("=" * 56)

    # Wake the loop at once when Windows says the notification list changed (not every build fires it; polling stays).
    wake = threading.Event()
    try:
        listener.add_notification_changed(lambda s, e: wake.set())
        log("notification-changed event: on")
    except Exception as e:
        log(f"notification-changed event not available ({e}); polling only")

    seen = set()
    # v2: forward what is already stacked (newest notifications last), instead of skipping it.
    cutoff = datetime.now(timezone.utc) - timedelta(hours=float(cfg["backlog_hours"]))
    try:
        stacked = list(await listener.get_notifications_async(NotificationKinds.TOAST))
        stacked.sort(key=created_at)
        sent = 0
        for n in stacked:
            seen.add(n.id)
            p = to_payload(cfg, n)
            if p and created_at(n) >= cutoff:
                if post_message(cfg, p):
                    sent += 1
        log(f"startup: {len(stacked)} notifications waiting, {sent} WhatsApp messages forwarded")
    except Exception as e:
        log(f"startup read error: {e}")

    heartbeat(cfg)
    last_heartbeat = asyncio.get_event_loop().time()
    last_flush = last_heartbeat

    while True:
        now = asyncio.get_event_loop().time()
        if now - last_heartbeat >= float(cfg["heartbeat_seconds"]):
            heartbeat(cfg)
            last_heartbeat = now
        if now - last_flush >= 30:
            flush_outbox(cfg)
            last_flush = now
        try:
            notifs = await listener.get_notifications_async(NotificationKinds.TOAST)
        except Exception as e:
            log(f"poll error: {e}")
            await asyncio.sleep(2)
            continue
        new = [n for n in notifs if n.id not in seen]
        new.sort(key=created_at)
        for n in new:
            seen.add(n.id)
            p = to_payload(cfg, n)
            if not p:
                continue
            ok = post_message(cfg, p)
            log(f"{'sent ' if ok else 'queued'}: {p['chat']} | {p['body'][:60]}")
        if len(seen) > 5000:
            seen = set(n.id for n in notifs)
        # Sleep until the next poll, or sooner when Windows signals a change.
        wake.clear()
        await asyncio.get_event_loop().run_in_executor(None, wake.wait, float(cfg["poll_seconds"]))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log("stopped.")
