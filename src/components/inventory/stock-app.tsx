"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardList, Package, Plus, Printer, ScanLine, Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createHandoverAction, registerMovementAction, unitHistoryAction } from "@/lib/inventory/actions";
import { dashboard, MOVEMENTS, movementOf, STATUS_TONE, STATUSES, type MovementKey, type StockStatus } from "@/lib/inventory/engine";
import type { HistoryRow, PickLists, RecentCheckout, StockUnit } from "@/lib/inventory/load";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// INV-d "Estoque em Campo": the four screens of the stock app (Stock · Register · Hand-over · Dashboard).

type Tab = "stock" | "register" | "handover" | "dashboard";
type Props = { units: StockUnit[]; lists: PickLists; recent: RecentCheckout[]; can: { move: boolean; add: boolean; handover: boolean }; initialTab: string };

const PAGE = 60;
const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50";
const LINK = "inline-flex h-10 items-center rounded-lg border px-3 text-[13px] hover:bg-muted";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function Badge({ status }: { status: StockStatus }) {
  const t = useT();
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status].badge)}>{t(status)}</span>;
}

export function StockApp({ units, lists, recent, can, initialTab }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>((["stock", "register", "handover", "dashboard"] as Tab[]).includes(initialTab as Tab) ? (initialTab as Tab) : "stock");
  const [open, setOpen] = useState<StockUnit | null>(null);
  const [preset, setPreset] = useState<StockUnit | null>(null);
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "stock", label: t("Stock"), icon: <Package className="size-4" aria-hidden /> },
    { key: "register", label: t("Register"), icon: <Plus className="size-4" aria-hidden /> },
    { key: "handover", label: t("Hand-over"), icon: <ClipboardList className="size-4" aria-hidden /> },
    { key: "dashboard", label: t("Dashboard"), icon: <BarChart3 className="size-4" aria-hidden /> },
  ];
  const go = (k: Tab) => {
    setTab(k);
    window.scrollTo(0, 0);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Stock")}</h1>
        <Link href="/inventory/stock?view=table" className="text-[13px] text-text-2 underline underline-offset-2">
          {t("Table view")}
        </Link>
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1" aria-label={t("Stock screens")}>
        {tabs.map((x) => (
          <button key={x.key} type="button" onClick={() => go(x.key)} className={cn("inline-flex h-10 min-w-fit flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium", tab === x.key ? "bg-card shadow-card" : "text-text-2 hover:bg-card/60")}>
            {x.icon} {x.label}
          </button>
        ))}
      </nav>

      {tab === "stock" && <StockList units={units} onOpen={setOpen} />}
      {tab === "register" && (
        <RegisterForm
          units={units}
          lists={lists}
          can={can}
          preset={preset}
          onDone={() => {
            setPreset(null);
            go("stock");
          }}
        />
      )}
      {tab === "handover" && <HandoverForm units={units} lists={lists} recent={recent} can={can} />}
      {tab === "dashboard" && <Dashboard units={units} />}

      {open && (
        <UnitSheet
          unit={open}
          canMove={can.move}
          onClose={() => setOpen(null)}
          onMove={() => {
            setPreset(open);
            setOpen(null);
            go("register");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Stock

function StockList({ units, onOpen }: { units: StockUnit[]; onOpen: (u: StockUnit) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StockStatus | "">("");
  const [page, setPage] = useState(1);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<StockStatus, number>;
    for (const u of units) c[u.status]++;
    return c;
  }, [units]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return units.filter((u) => (!status || u.status === status) && (!needle || (u.serial ?? "").toLowerCase().includes(needle) || u.product.toLowerCase().includes(needle) || (u.client ?? "").toLowerCase().includes(needle) || (u.location ?? "").toLowerCase().includes(needle)));
  }, [units, q, status]);
  const shown = list.slice(0, page * PAGE);
  const chips: { value: StockStatus | ""; label: string; n: number }[] = [{ value: "", label: t("All"), n: units.length }, ...STATUSES.map((s) => ({ value: s, label: t(s), n: counts[s] }))];

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("Search serial, product, client…")}
            className={`${BOX} h-11 pl-9`}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            (document.querySelector('input[type="search"]') as HTMLInputElement | null)?.focus();
            toast(t("Point a barcode scanner at the serial: it types into the search box."));
          }}
          className={cn(LINK, "h-11 gap-1.5")}
        >
          <ScanLine className="size-4" aria-hidden /> {t("Scan")}
        </button>
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => {
              setStatus(c.value);
              setPage(1);
            }}
            className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px]", status === c.value ? "border-primary bg-primary/10 font-semibold text-primary" : "text-text-2")}
          >
            {c.value && <span className="inline-block size-2 rounded-full" style={{ background: STATUS_TONE[c.value].bar }} aria-hidden />}
            {c.label} <span className="rounded-full bg-muted px-1.5 text-xs">{c.n}</span>
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{list.length === 1 ? t("1 unit") : t("{n} units", { n: list.length })}</p>
      {list.length === 0 ? (
        <p className="rounded-2xl border bg-card px-[18px] py-6 text-center text-sm text-muted-foreground shadow-card">{t("No unit matches.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => onOpen(u)} className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-card hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold">{u.serial || t("No serial")}</p>
                  <p className="truncate text-sm">{u.product}</p>
                  <p className="truncate text-xs text-text-2">
                    {u.client ?? u.location ?? t("No client")} · {formatDate(u.updatedAt.slice(0, 10))}
                  </p>
                </div>
                <Badge status={u.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown.length && (
        <button type="button" onClick={() => setPage(page + 1)} className={cn(LINK, "mt-3 w-full justify-center")}>
          {t("Show more")}
        </button>
      )}
    </div>
  );
}

function UnitSheet({ unit, canMove, onClose, onMove }: { unit: StockUnit; canMove: boolean; onClose: () => void; onMove: () => void }) {
  const t = useT();
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void unitHistoryAction(unit.serial).then((h) => live && setHistory(h));
    return () => {
      live = false;
    };
  }, [unit.serial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 shadow-card md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-semibold">{unit.serial || t("No serial")}</p>
            <p className="text-sm">{unit.product}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-text-2">{t("Stage")}</dt>
          <dd>
            <Badge status={unit.status} />
          </dd>
          <dt className="text-text-2">{t("Client / site")}</dt>
          <dd>{unit.client ?? "—"}</dd>
          <dt className="text-text-2">{t("Location")}</dt>
          <dd>{unit.location ?? "—"}</dd>
          <dt className="text-text-2">{t("Responsible")}</dt>
          <dd>{unit.staff ?? "—"}</dd>
          {unit.mac && (
            <>
              <dt className="text-text-2">MAC</dt>
              <dd className="font-mono">{unit.mac}</dd>
            </>
          )}
          <dt className="text-text-2">{t("Last change")}</dt>
          <dd>{formatDateTime(unit.updatedAt)}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {canMove && (
            <button type="button" onClick={onMove} className={BTN}>
              <Plus className="size-4" aria-hidden /> {t("Register a movement")}
            </button>
          )}
          <Link href={`/inventory/stock/${unit.id}`} className={cn(LINK, "h-11")}>
            {t("Open the record")}
          </Link>
        </div>
        <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("History")}</h3>
        {history === null ? (
          <p className="text-sm text-muted-foreground">{t("Loading…")}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No movements recorded for this serial.")}</p>
        ) : (
          <ol className="flex flex-col divide-y text-sm">
            {history.map((h, i) => (
              <li key={i} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="font-medium">{t(h.what)}</span>
                  <span className="text-xs text-text-2">{formatDateTime(h.at)}</span>
                </div>
                <p className="text-xs text-text-2">
                  {h.status && <Badge status={h.status} />} {h.location ? ` ${h.location}` : ""}
                  {h.quantity ? ` · ${h.quantity > 0 ? "+" : ""}${h.quantity}` : ""}
                  {h.who ? ` · ${h.who}` : ""}
                  {h.notes ? ` · ${h.notes}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Register

function RegisterForm({ units, lists, can, preset, onDone }: { units: StockUnit[]; lists: PickLists; can: Props["can"]; preset: StockUnit | null; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [serial, setSerial] = useState(preset?.serial ?? "");
  const [picked, setPicked] = useState<StockUnit | null>(preset);
  const [productId, setProductId] = useState<number | null>(null);
  const [movement, setMovement] = useState<MovementKey | "">("");
  const [projectId, setProjectId] = useState<number | null>(preset?.projectId ?? null);
  const [staffId, setStaffId] = useState<number | null>(preset?.staffId ?? null);
  const [location, setLocation] = useState(preset?.location ?? "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const matches = useMemo(() => {
    const n = serial.trim().toLowerCase();
    return n.length >= 2 && !picked ? units.filter((u) => (u.serial ?? "").toLowerCase().includes(n)).slice(0, 8) : [];
  }, [serial, units, picked]);
  const exact = picked ?? units.find((u) => (u.serial ?? "").toLowerCase() === serial.trim().toLowerCase()) ?? null;
  const isNew = !exact && serial.trim().length > 0;
  const mv = movement ? movementOf(movement) : undefined;
  const canSave = Boolean(serial.trim() && mv && (exact ? can.move : can.add && productId));

  const submit = () =>
    start(async () => {
      if (!mv) return;
      const r = await registerMovementAction({ itemId: exact?.id ?? null, serial: serial.trim(), productId: exact ? null : productId, movement: mv.key, projectId, staffId, location: location.trim() || null, note });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(exact ? t("Saved · {from} → {to}", { from: t(exact.status), to: t(r.status) }) : t("Registered · {to}", { to: t(r.status) }));
      router.refresh();
      onDone();
    });

  if (!can.move && !can.add) return <p className="rounded-2xl border bg-card px-[18px] py-4 text-sm text-muted-foreground shadow-card">{t("You can see the stock but not change it.")}</p>;

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border bg-card px-[18px] py-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) submit();
      }}
    >
      <div className="relative">
        <label className="block text-sm font-medium">
          {t("Unit (serial)")}
          <input
            value={serial}
            onChange={(e) => {
              setSerial(e.target.value);
              setPicked(null);
            }}
            placeholder={t("Type or scan the serial")}
            className={`${BOX} mt-1 h-11 font-mono`}
            autoComplete="off"
          />
        </label>
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-card shadow-card">
            {matches.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSerial(u.serial ?? "");
                    setPicked(u);
                    setProjectId(u.projectId);
                    setStaffId(u.staffId);
                    setLocation(u.location ?? "");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="font-mono font-semibold">{u.serial}</span> · {u.product}
                  </span>
                  <Badge status={u.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {exact && (
          <p className="mt-1 text-xs text-text-2">
            {exact.product} · {t("now")}: <b>{t(exact.status)}</b>
          </p>
        )}
        {isNew && <p className="mt-1 text-xs text-warn-fg">{t("New serial: a Stock record will be created.")}</p>}
      </div>
      {isNew && (
        <label className="block text-sm font-medium">
          {t("Product")}
          <select value={productId ?? ""} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`} required>
            <option value="">{t("Choose…")}</option>
            {lists.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("Movement")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MOVEMENTS.map((m) => (
            <button key={m.key} type="button" onClick={() => setMovement(m.key)} aria-pressed={movement === m.key} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm", movement === m.key ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>
              <span>{t(m.label)}</span>
              <Badge status={m.to} />
            </button>
          ))}
        </div>
        {mv && (
          <p className="mt-2 text-xs text-text-2">
            {exact ? (
              <>
                {t("Stage")}: <Badge status={exact.status} /> → <Badge status={mv.to} />
              </>
            ) : (
              <>
                {t("First movement of this unit")} → <Badge status={mv.to} />
              </>
            )}
          </p>
        )}
      </fieldset>
      <label className="block text-sm font-medium">
        {t("Client / site (project)")}
        <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
          <option value="">{mv?.wantsProject ? t("Choose…") : t("None")}</option>
          {lists.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {t("Responsible")}
          <select value={staffId ?? ""} onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
            <option value="">{t("None")}</option>
            {lists.employees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("Location (when it comes back to stock)")}
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Warehouse" className={`${BOX} mt-1 h-11`} list="stock-locations" />
          <datalist id="stock-locations">
            {[...new Set(units.map((u) => u.location).filter(Boolean))].map((l) => (
              <option key={l!} value={l!} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block text-sm font-medium">
        {t("Note")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${BOX} mt-1 py-2`} placeholder={t("Optional")} />
      </label>
      <button type="submit" disabled={!canSave || pending} className={BTN}>
        {t("Save movement")}
      </button>
      <p className="text-xs text-muted-foreground">{t("Saving updates the unit's stage and location, adds a ledger row (so stock by location follows) and keeps the history.")}</p>
    </form>
  );
}

// ---------------------------------------------------------------- Hand-over

function HandoverForm({ units, lists, recent, can }: { units: StockUnit[]; lists: PickLists; recent: RecentCheckout[]; can: Props["can"] }) {
  const t = useT();
  const router = useRouter();
  const [technicianId, setTechnicianId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [type, setType] = useState<"Materials for a Project" | "Tools for Technician">("Materials for a Project");
  const [movement, setMovement] = useState<MovementKey>("install");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const candidates = useMemo(() => units.filter((u) => u.status === "Separated" && (!technicianId || u.staffId === technicianId) && (!projectId || u.projectId === projectId)), [units, technicianId, projectId]);
  const search = () => {
    setSearched(true);
    setChosen(new Set(candidates.map((u) => u.id)));
  };
  const generate = () =>
    start(async () => {
      const r = await createHandoverAction({ type, projectId, technicianId, itemIds: [...chosen], movement, note });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Receipt {n} created", { n: String(r.checkoutId).padStart(4, "0") }));
      window.open(`/inventory/inventory-checkout/${r.checkoutId}/receipt`, "_blank", "noopener");
      setSearched(false);
      setChosen(new Set());
      setNote("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {!can.handover ? (
        <p className="rounded-2xl border bg-card px-[18px] py-4 text-sm text-muted-foreground shadow-card">{t("You can see the stock but not create a hand-over.")}</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <p className="text-xs text-muted-foreground">{t("Units picked at the warehouse (stage Separated) for this technician or client become an Inventory Checkout with a receipt to print and sign.")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              {t("Technician")}
              <select value={technicianId ?? ""} onChange={(e) => setTechnicianId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                <option value="">{t("Any")}</option>
                {lists.employees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t("Client / site (project)")}
              <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                <option value="">{t("Any")}</option>
                {lists.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={search} className={BTN}>
            {t("Find the picked units")}
          </button>
          {searched && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-2">{t("{n} of {total} selected", { n: chosen.size, total: candidates.length })}</span>
                <span className="flex gap-3">
                  <button type="button" className="underline underline-offset-2" onClick={() => setChosen(new Set(candidates.map((u) => u.id)))}>
                    {t("All")}
                  </button>
                  <button type="button" className="underline underline-offset-2" onClick={() => setChosen(new Set())}>
                    {t("None")}
                  </button>
                </span>
              </div>
              {candidates.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-center text-sm text-text-2">{t("No unit in stage Separated for this filter. Pick units first (Register › Picked at the warehouse).")}</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto rounded-lg border">
                  {candidates.map((u) => (
                    <li key={u.id} className="border-b last:border-0">
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={chosen.has(u.id)}
                          onChange={(e) => {
                            const next = new Set(chosen);
                            if (e.target.checked) next.add(u.id);
                            else next.delete(u.id);
                            setChosen(next);
                          }}
                          className="size-5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono font-semibold">{u.serial || t("No serial")}</span> · {u.product}
                          <span className="block truncate text-xs text-text-2">{u.client ?? "—"}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  {t("Checkout type")}
                  <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={`${BOX} mt-1 h-11`}>
                    <option value="Materials for a Project">{t("Materials for a Project")}</option>
                    <option value="Tools for Technician">{t("Tools for Technician")}</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t("Record the hand-over as")}
                  <select value={movement} onChange={(e) => setMovement(e.target.value as MovementKey)} className={`${BOX} mt-1 h-11`}>
                    {MOVEMENTS.filter((m) => m.key !== "receive").map((m) => (
                      <option key={m.key} value={m.key}>
                        {t(m.label)} → {t(m.to)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">
                {t("Note")}
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${BOX} mt-1 py-2`} placeholder={t("Optional")} />
              </label>
              <button type="button" disabled={chosen.size === 0 || pending} onClick={generate} className={BTN}>
                <Printer className="size-4" aria-hidden /> {t("Create the receipt")}
              </button>
              <p className="text-xs text-muted-foreground">{t("Creating records the hand-over of the selected units (stage and history) and opens the receipt to print or sign.")}</p>
            </>
          )}
        </div>
      )}
      {recent.length > 0 && (
        <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Recent receipts")}</h2>
          <ul className="divide-y text-sm">
            {recent.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono font-semibold">{String(c.id).padStart(4, "0")}</span> · {c.technician ?? c.project ?? "—"}
                  <span className="block text-xs text-text-2">
                    {c.project && c.technician ? `${c.project} · ` : ""}
                    {c.lines === 1 ? t("1 line") : t("{n} lines", { n: c.lines })}
                    {c.date ? ` · ${formatDate(c.date)}` : ""}
                  </span>
                </span>
                <a href={`/inventory/inventory-checkout/${c.id}/receipt`} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {t("View / print")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Dashboard

function Dashboard({ units }: { units: StockUnit[] }) {
  const t = useT();
  const d = useMemo(() => dashboard(units.map((u) => ({ status: u.status, product: u.product, client: u.client, cost: u.cost }))), [units]);
  const max = Math.max(1, ...STATUSES.map((s) => d.counts[s]));
  const kpis: { label: string; value: string; color?: string }[] = [{ label: t("Total units"), value: d.total.toLocaleString() }, ...STATUSES.filter((s) => s !== "Discarded").map((s) => ({ label: t(s), value: d.counts[s].toLocaleString(), color: STATUS_TONE[s].bar }))];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card px-3 py-2 shadow-card">
            <div className="mb-1 h-1 rounded-full" style={{ background: k.color ?? "var(--primary)" }} aria-hidden />
            <p className="text-xl font-semibold tabular-nums">{k.value}</p>
            <p className="text-xs text-text-2">{k.label}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Units by stage")}</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {STATUSES.map((s) => (
            <li key={s} className="grid grid-cols-[110px_1fr_48px] items-center gap-2">
              <span className="truncate">{t(s)}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (d.counts[s] / max) * 100)}%`, background: STATUS_TONE[s].bar }} />
              </span>
              <span className="text-right tabular-nums">{d.counts[s].toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Value in equipment (at cost)")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUSES.filter((s) => s !== "Discarded").map((s) => (
            <div key={s} className="rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-lg font-semibold tabular-nums">{money.format(d.value[s])}</p>
              <p className="text-xs text-text-2">{t(s)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{d.withoutCost ? t("{n} units have no cost on their product and do not count.", { n: d.withoutCost }) : t("Every unit has a cost.")}</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Value per client / site (installed)")}</h2>
          {d.valueByClient.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nothing installed with a cost yet.")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {d.valueByClient.map(([c, v]) => (
                <li key={c} className="flex justify-between gap-2 py-1.5">
                  <span className="truncate">{c}</span>
                  <span className="tabular-nums">{money.format(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t("Top products in stock")}</h2>
          <ul className="divide-y text-sm">
            {d.topProducts.map(([p, n]) => (
              <li key={p} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">{p}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
