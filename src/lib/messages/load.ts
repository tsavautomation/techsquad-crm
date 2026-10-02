import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, toDateTimeLocalET } from "@/lib/dates";
import { mapAddress } from "@/lib/field-day/load";
import type { Address } from "@/lib/records/values";
import { clock } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { langFor, parseMessages, type MessageTemplate, type MsgLang } from "./templates";

// F4 "Message the client" panel on a Project or Contact page (SPEC §9.1 F4-c, F4-d).

export type MsgPerson = { id: number; name: string; firstName: string; role: string; phone: string | null; email: string | null; lang: MsgLang };
export type MsgProject = { id: number; title: string; address: string; plan: string; visitDate: string; visitTime: string };
export type MessagePanelData = {
  people: MsgPerson[];
  projects: MsgProject[];
  templates: MessageTemplate[];
  sender: string;
  canLog: boolean;
  types: string[];
  results: string[];
};

type ContactRow = { id: number; title: string | null; first_name: string | null; last_name: string | null; main_phone: string | null; intl_phone: string | null; email: string | null; preferred_language: string | null };
type ProjectRow = { id: number; title: string | null; job_address: Address | null; maintenance_type: string | null; job_owner_id: number | null; lead_designer_id: number | null; gc_pm_id: number | null; referral_contact_id: number | null };

export async function loadMessagePanel(db: SupabaseClient, user: CurrentUser, table: "projects" | "contacts", id: number): Promise<MessagePanelData | null> {
  const ct = getTable("contacts");
  if (!canOpen(user.permissions, ct, getTable)) return null;
  const it = getTable("contact_interactions");
  const options = (name: string) => (it.fields.find((f) => f.name === name)?.options ?? []).filter((o) => !o.retired).map((o) => o.value);
  const projectCols = "id, title, job_address, maintenance_type, job_owner_id, lead_designer_id, gc_pm_id, referral_contact_id";

  // Projects for the {project}, {address}, {plan} and next-visit words.
  let projects: ProjectRow[] = [];
  if (table === "projects") {
    const { data } = await db.from("projects").select(projectCols).eq("id", id).maybeSingle();
    if (data) projects = [data as unknown as ProjectRow];
  } else if (canOpen(user.permissions, getTable("projects"), getTable)) {
    const { data } = await db.from("projects").select(projectCols).eq("job_owner_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
    projects = (data ?? []) as unknown as ProjectRow[];
  }

  // Who can be messaged: the contact, or the project's client, designer, GC project manager and referrer.
  const roles: [number | null | undefined, string][] =
    table === "contacts" ? [[id, "Contact"]] : [[projects[0]?.job_owner_id, "Client"], [projects[0]?.lead_designer_id, "Lead Designer"], [projects[0]?.gc_pm_id, "GC Project Manager"], [projects[0]?.referral_contact_id, "Referral"]];
  const ids = [...new Set(roles.map(([x]) => x).filter((x): x is number => typeof x === "number"))];
  const { data: cData } = ids.length ? await db.from("contacts").select("id, title, first_name, last_name, main_phone, intl_phone, email, preferred_language").in("id", ids).is("deleted_at", null) : { data: [] };
  const byId = new Map(((cData ?? []) as ContactRow[]).map((c) => [c.id, c]));
  const people: MsgPerson[] = [];
  for (const [cid, role] of roles) {
    const c = typeof cid === "number" ? byId.get(cid) : undefined;
    if (!c || people.some((p) => p.id === c.id)) continue;
    const name = c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || `#${c.id}`;
    people.push({ id: c.id, name, firstName: c.first_name?.trim() || name.split(" ")[0], role, phone: c.main_phone || c.intl_phone || null, email: c.email || null, lang: langFor(c.preferred_language) });
  }

  // Next visit per project.
  const next = new Map<number, string>();
  if (projects.length && canOpen(user.permissions, getTable("visits"), getTable)) {
    const { data } = await db.from("visits").select("project_id, starts_at").in("project_id", projects.map((p) => p.id)).gte("starts_at", new Date().toISOString()).neq("status", "Cancelled").is("deleted_at", null).order("starts_at");
    for (const v of (data ?? []) as { project_id: number; starts_at: string }[]) if (!next.has(v.project_id)) next.set(v.project_id, v.starts_at);
  }

  const { data: s } = await db.from("app_settings").select("value").eq("key", "messages").maybeSingle();
  const settings = parseMessages((s as { value: unknown } | null)?.value);
  return {
    people,
    projects: projects.map((p) => {
      const at = next.get(p.id);
      const local = at ? toDateTimeLocalET(at) : "";
      return { id: p.id, title: p.title ?? `#${p.id}`, address: mapAddress(p.job_address) ?? "", plan: p.maintenance_type ?? "", visitDate: local ? formatDate(local.slice(0, 10)) : "", visitTime: local ? clock(local.slice(11)) : "" };
    }),
    templates: settings.templates.filter((x) => x.active),
    sender: user.firstName?.trim() || user.email.split("@")[0],
    canLog: canDo(user.permissions, it, "create", getTable),
    types: options("type"),
    results: options("result"),
  };
}
