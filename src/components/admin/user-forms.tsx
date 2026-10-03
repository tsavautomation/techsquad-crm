"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteUserAction, inviteUserAction, sendPasswordLinkAction, updateUserAction } from "@/lib/admin/user-actions";
import { useT } from "@/i18n/client";

const INPUT = "h-11 w-full rounded-lg border bg-card px-3 text-base";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";
const PRIMARY = `${BTN} border-foreground bg-foreground text-background hover:bg-foreground/90`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function LinkBox({ link, emailed }: { link: string; emailed: boolean }) {
  const t = useT();
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="mb-2">
        {t(emailed ? "The sign-up link was emailed (in test mode it goes to the test inbox only)." : "The email could not be sent.")} {t("You can also copy the link and text it. It works once, for 24 hours.")}
      </p>
      <button
        type="button"
        className={BTN}
        onClick={() => {
          void navigator.clipboard.writeText(link);
          toast.success(t("Link copied"));
        }}
      >
        <Copy className="size-4" aria-hidden /> {t("Copy sign-up link")}
      </button>
    </div>
  );
}

export function InviteForm() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [done, setDone] = useState<{ link: string; emailed: boolean; userId: string } | null>(null);

  if (done)
    return (
      <div className="space-y-4">
        <p className="text-base">
          {t("Login created for")} <strong>{email}</strong>.
        </p>
        <LinkBox link={done.link} emailed={done.emailed} />
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => router.push(`/admin/users/${done.userId}`)}>
            {t("Set what they may do")}
          </button>
          <button type="button" className={BTN} onClick={() => router.push("/admin/users")}>
            {t("Back to users")}
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await inviteUserAction({ email, firstName, lastName });
          if (!r.ok) return void toast.error(t(r.message));
          setDone({ link: r.link ?? "", emailed: Boolean(r.emailed), userId: r.userId ?? "" });
        });
      }}
    >
      <Field label={t("Email")}>
        <input className={INPUT} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("First name")}>
          <input className={INPUT} required value={firstName} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label={t("Last name")}>
          <input className={INPUT} value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <button type="submit" disabled={pending} className={PRIMARY}>
        {t("Create login and send sign-up link")}
      </button>
    </form>
  );
}

type UserProps = {
  userId: string;
  email: string;
  initial: { firstName: string; lastName: string; active: boolean };
  /** delete: F11-b, administrators, only for logins that never signed in. */
  can: { edit: boolean; link: boolean; delete?: boolean };
  isMe: boolean;
};

export function UserForm({ userId, email, initial, can, isMe }: UserProps) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [firstName, setFirst] = useState(initial.firstName);
  const [lastName, setLast] = useState(initial.lastName);
  const [active, setActive] = useState(initial.active);
  const [link, setLink] = useState<{ link: string; emailed: boolean } | null>(null);

  const save = () =>
    start(async () => {
      const r = await updateUserAction(userId, { firstName, lastName, active });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      router.refresh();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label={t("Email")}>
        <input className={`${INPUT} bg-muted`} value={email} readOnly />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("First name")}>
          <input className={INPUT} required disabled={!can.edit} value={firstName} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label={t("Last name")}>
          <input className={INPUT} disabled={!can.edit} value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5" checked={active} disabled={!can.edit || isMe} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-base">{t("Active (can sign in)")}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {can.edit && (
          <button type="submit" disabled={pending} className={PRIMARY}>
            {t("Save")}
          </button>
        )}
        {can.link && active && (
          <button
            type="button"
            disabled={pending}
            className={BTN}
            onClick={() =>
              start(async () => {
                const r = await sendPasswordLinkAction(userId);
                if (!r.ok) return void toast.error(t(r.message));
                setLink({ link: r.link ?? "", emailed: Boolean(r.emailed) });
              })
            }
          >
            <KeyRound className="size-4" aria-hidden /> {t("Send set-password link")}
          </button>
        )}
        {can.delete && !isMe && (
          <button
            type="button"
            disabled={pending}
            className={`${BTN} text-bad-fg`}
            onClick={() => {
              if (!confirm(t("Delete this login for good? It never signed in, so nothing else is lost."))) return;
              start(async () => {
                const r = await deleteUserAction(userId);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Login deleted"));
                router.push("/admin/users");
                router.refresh();
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden /> {t("Delete login")}
          </button>
        )}
      </div>
      {can.delete && !isMe && <p className="text-xs text-muted-foreground">{t("This person never signed in, so the login can be deleted for good. Logins that were used are deactivated instead, so their name stays on what they did.")}</p>}
      {link && <LinkBox {...link} />}
    </form>
  );
}
