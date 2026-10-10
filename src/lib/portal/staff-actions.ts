"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { deliver, queueEmail } from "@/lib/engine/email";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";

// Customer portal (F6), office side: who may see a project, the invitation, and which library documents /
// apps the project shows. Everything runs as the signed-in staff member (row-level security applies);
// only creating the login and its sign-up link use the admin key, as Admin › Users does.

const DENIED: ActionResult = { ok: false, message: "You don't have permission to do that." };
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.tsav.net").replace(/\/$/, "");

/** Opening a project to a customer, and picking what it shows, counts as modifying the project. */
async function canEditProject(perms: ReadonlySet<string>) {
  return canDo(perms, getTable("projects"), "modify", getTable);
}

/** Contacts by name or email, for the "Give access" picker. */
export async function searchPortalContactsAction(q: string): Promise<{ id: number; title: string; email: string | null }[]> {
  await requireUser();
  const term = q.trim();
  if (term.length < 2) return [];
  const db = await recordsDb();
  const { data } = await db.from("contacts").select("id, title, email").is("deleted_at", null).or(`title.ilike.%${term.replace(/[%,()]/g, "")}%,email.ilike.%${term.replace(/[%,()]/g, "")}%`).order("title").limit(8);
  return ((data ?? []) as { id: number; title: string | null; email: string | null }[]).map((c) => ({ id: c.id, title: c.title ?? `#${c.id}`, email: c.email }));
}

type Lang = "en" | "pt" | "es";
const langOf = (preferred: unknown): Lang => (preferred === "Português" ? "pt" : preferred === "Español" ? "es" : "en");

const COPY: Record<Lang, { subjectNew: string; subjectMore: string; hi: string; intro: string; more: string; button: string; buttonMore: string; then: string; install: string; once: string }> = {
  en: {
    subjectNew: "Your Tech Squad client portal",
    subjectMore: "A project was added to your Tech Squad portal",
    hi: "Hi",
    intro: "Tech Squad has opened a client portal for your project {project}. There you can see your visits, your maintenance plan, invoices and payments, the passwords of your systems, documents and the apps you use, and ask for a service call.",
    more: "The project {project} is now in your Tech Squad client portal.",
    button: "Create my password",
    buttonMore: "Open my portal",
    then: "Then sign in at {url} with {email}.",
    install: "To keep it on your phone like an app, follow the steps at {install}.",
    once: "The link works once and expires in 24 hours. If it has expired, use “Forgot your password?” on the sign-in page.",
  },
  pt: {
    subjectNew: "Seu portal do cliente Tech Squad",
    subjectMore: "Um projeto foi adicionado ao seu portal Tech Squad",
    hi: "Olá",
    intro: "A Tech Squad abriu um portal do cliente para o seu projeto {project}. Nele você vê suas visitas, seu plano de manutenção, faturas e pagamentos, as senhas dos seus sistemas, documentos e os aplicativos que usa, e pode pedir uma visita técnica.",
    more: "O projeto {project} agora está no seu portal do cliente Tech Squad.",
    button: "Criar minha senha",
    buttonMore: "Abrir meu portal",
    then: "Depois entre em {url} com {email}.",
    install: "Para deixar no celular como um aplicativo, siga os passos em {install}.",
    once: "O link funciona uma vez e vence em 24 horas. Se venceu, use “Esqueceu a senha?” na tela de entrada.",
  },
  es: {
    subjectNew: "Su portal de cliente Tech Squad",
    subjectMore: "Se agregó un proyecto a su portal Tech Squad",
    hi: "Hola",
    intro: "Tech Squad abrió un portal de cliente para su proyecto {project}. Allí puede ver sus visitas, su plan de mantenimiento, facturas y pagos, las contraseñas de sus sistemas, documentos y las aplicaciones que usa, y pedir una visita de servicio.",
    more: "El proyecto {project} ya está en su portal de cliente Tech Squad.",
    button: "Crear mi contraseña",
    buttonMore: "Abrir mi portal",
    then: "Luego ingrese en {url} con {email}.",
    install: "Para tenerlo en su teléfono como una app, siga los pasos en {install}.",
    once: "El enlace funciona una vez y vence en 24 horas. Si venció, use “¿Olvidó su contraseña?” en la pantalla de ingreso.",
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** The invitation (new login) or the "project added" note (existing login), through the outbox (test mode applies). */
async function emailPortal(to: string, name: string, project: string, lang: Lang, link: string | null, projectId: number) {
  const c = COPY[lang];
  const vars = { project, url: `${site()}/portal`, email: to, install: `${site()}/portal/install` };
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px">
<p>${esc(c.hi)} ${esc(name || to)},</p>
<p>${esc(fill(link ? c.intro : c.more, vars))}</p>
<p style="margin:24px 0"><a href="${esc(link ?? vars.url)}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(link ? c.button : c.buttonMore)}</a></p>
<p style="color:#6b7280;font-size:13px">${esc(fill(c.then, vars))} ${esc(fill(c.install, vars))}</p>
${link ? `<p style="color:#6b7280;font-size:13px">${esc(c.once)}</p>` : ""}</div>`;
  const db = adminDb();
  const id = await queueEmail(db, { automationId: null, table: "projects", recordId: projectId, from: "TS CRM", to: [to], subject: link ? c.subjectNew : c.subjectMore, html, attachments: [] });
  return deliver(db, id);
}

const confirmLink = (hashedToken: string) => `${site()}/auth/confirm?token_hash=${hashedToken}&type=invite&next=${encodeURIComponent("/auth/update-password")}`;

const GrantInput = z.object({ projectId: z.number().int().positive(), contactId: z.number().int().positive() });

/** Give a Contact access to the project. New customers get a sign-up link; existing portal users a short note. */
export async function grantPortalAccessAction(input: z.input<typeof GrantInput>): Promise<ActionResult & { link?: string; emailed?: boolean }> {
  const user = await requireUser();
  if (!(await canEditProject(user.permissions))) return DENIED;
  const parsed = GrantInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { projectId, contactId } = parsed.data;
  const db = await recordsDb();
  const [{ data: contact }, { data: project }] = await Promise.all([
    db.from("contacts").select("id, title, first_name, last_name, email, preferred_language").eq("id", contactId).is("deleted_at", null).maybeSingle(),
    db.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
  ]);
  const c = contact as { id: number; title: string | null; first_name: string | null; last_name: string | null; email: string | null; preferred_language: string | null } | null;
  if (!c || !project) return { ok: false, message: "Contact or project not found." };
  const email = c.email?.trim().toLowerCase();
  if (!email) return { ok: false, message: "This contact has no email. Add one on the Contact first." };

  // A staff login with the same email can never become a customer login.
  const { data: byEmail } = await db.from("profiles").select("id, contact_id").ilike("email", email).maybeSingle();
  const existing = byEmail as { id: string; contact_id: number | null } | null;
  if (existing && existing.contact_id == null) return { ok: false, message: "That email belongs to a staff login. Use a different email for the customer." };
  if (existing && existing.contact_id !== contactId) return { ok: false, message: "That email already belongs to another customer's login." };

  const { error } = await db.from("portal_access").upsert({ project_id: projectId, contact_id: contactId, invited_at: new Date().toISOString(), invited_by: user.id }, { onConflict: "project_id,contact_id" });
  if (error) return { ok: false, message: error.message };

  const projectTitle = (project as { title: string | null }).title ?? `#${projectId}`;
  const lang = langOf(c.preferred_language);
  let link: string | undefined;
  if (!existing) {
    const { data, error: linkError } = await adminDb().auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { first_name: c.first_name ?? "", last_name: c.last_name ?? "", contact_id: String(contactId) } },
    });
    if (linkError) return { ok: false, message: linkError.message };
    link = confirmLink(data.properties.hashed_token);
  }
  const sent = await emailPortal(email, c.first_name ?? c.title ?? "", projectTitle, lang, link ?? null, projectId);
  revalidatePath(`/projects/projects/${projectId}`);
  if (!sent.ok) return { ok: false, message: `Access given, but the email failed: ${sent.error ?? "unknown error"}. Copy the link below.`, link };
  return { ok: true, link, emailed: true };
}

/** A fresh sign-up link for a customer who lost the first one (or never created a password). */
export async function resendPortalInviteAction(input: z.input<typeof GrantInput>): Promise<ActionResult & { link?: string; emailed?: boolean }> {
  const user = await requireUser();
  if (!(await canEditProject(user.permissions))) return DENIED;
  const parsed = GrantInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { projectId, contactId } = parsed.data;
  const db = await recordsDb();
  const [{ data: profile }, { data: contact }, { data: project }] = await Promise.all([
    db.from("profiles").select("id, email").eq("contact_id", contactId).maybeSingle(),
    db.from("contacts").select("title, first_name, preferred_language").eq("id", contactId).maybeSingle(),
    db.from("projects").select("title").eq("id", projectId).maybeSingle(),
  ]);
  const p = profile as { id: string; email: string } | null;
  const c = contact as { title: string | null; first_name: string | null; preferred_language: string | null } | null;
  if (!p || !c) return { ok: false, message: "This customer has no login yet. Use Give access." };
  const { data, error } = await adminDb().auth.admin.generateLink({ type: "recovery", email: p.email });
  if (error) return { ok: false, message: error.message };
  const link = `${site()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/auth/update-password")}`;
  const sent = await emailPortal(p.email, c.first_name ?? c.title ?? "", (project as { title: string | null } | null)?.title ?? `#${projectId}`, langOf(c.preferred_language), link, projectId);
  if (!sent.ok) return { ok: false, message: `Access given, but the email failed: ${sent.error ?? "unknown error"}. Copy the link below.`, link };
  return { ok: true, link, emailed: true };
}

/** Take the project out of the customer's portal. Their login stays (other projects may use it). */
export async function revokePortalAccessAction(input: z.input<typeof GrantInput>): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await canEditProject(user.permissions))) return DENIED;
  const parsed = GrantInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db.from("portal_access").delete().eq("project_id", parsed.data.projectId).eq("contact_id", parsed.data.contactId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/projects/projects/${parsed.data.projectId}`);
  return { ok: true };
}

const ToggleInput = z.object({ projectId: z.number().int().positive(), id: z.number().int().positive(), on: z.boolean() });

/** Tick / untick a library document or an app for this project's portal. */
export async function togglePortalItemAction(kind: "document" | "app", input: z.input<typeof ToggleInput>): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await canEditProject(user.permissions))) return DENIED;
  const parsed = ToggleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { projectId, id, on } = parsed.data;
  const db = await recordsDb();
  const table = kind === "document" ? "portal_document_projects" : "portal_app_projects";
  const key = kind === "document" ? "document_id" : "app_id";
  const { error } = on
    ? await db.from(table).upsert({ project_id: projectId, [key]: id }, { onConflict: `${key},project_id`, ignoreDuplicates: true })
    : await db.from(table).delete().eq("project_id", projectId).eq(key, id);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/projects/projects/${projectId}`);
  return { ok: true };
}
