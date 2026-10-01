import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { isLang, LANG_COOKIE, makeT, type Lang } from "./core";

/** The signed-in person's language; signed out (login page), the one last picked on this device. */
export const getLang = cache(async (): Promise<Lang> => {
  const session = await getSession();
  if (session.status === "active") return session.user.language;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : "en";
});

export async function getT() {
  return makeT(await getLang());
}
