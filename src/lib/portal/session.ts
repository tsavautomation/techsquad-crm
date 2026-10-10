import "server-only";
import { redirect } from "next/navigation";
import { getSession, type CurrentUser } from "@/lib/auth/session";

/** A customer-portal login (F6): a profile tied to a Contact. */
export type ClientUser = CurrentUser & { contactId: number };

/**
 * The signed-in customer, or a redirect: /portal/login (signed out), /auth/inactive (deactivated),
 * / (a staff member opened the portal: they have the whole app instead).
 */
export async function requireClient(): Promise<ClientUser> {
  const session = await getSession();
  if (session.status === "signed-out") redirect("/portal/login");
  if (session.status === "inactive") redirect("/auth/inactive");
  if (!session.user.contactId) redirect("/");
  return session.user as ClientUser;
}
