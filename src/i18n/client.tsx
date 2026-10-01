"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Lang, type T } from "./core";

const LangContext = createContext<Lang>("en");

/** Puts the person's language within reach of every client component (set by the root layout). */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
