"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";
import { useLang, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

// Voice dictation for long text boxes (F2, docs/portal-features-merge.md §C): the browser's own
// speech recognition (Safari on iPhone, Chrome). Hidden where the browser has none.

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const recognizer = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const noSubscribe = () => () => {};

/** The dictation language is chosen apart from the screen language (Fred 2026-10-05: "most of the crew is Brazilian"), and remembered on the device. */
const DICTATE_LANG_KEY = "crm:dictate-lang";
const PT_BR = "pt-BR";
const EN_US = "en-US";
type DictateLang = typeof PT_BR | typeof EN_US;
const langListeners = new Set<() => void>();
const subscribeLang = (cb: () => void) => {
  langListeners.add(cb);
  return () => {
    langListeners.delete(cb);
  };
};
const readDictateLang = (fallback: DictateLang): DictateLang => {
  try {
    const v = localStorage.getItem(DICTATE_LANG_KEY);
    return v === PT_BR || v === EN_US ? v : fallback;
  } catch {
    return fallback;
  }
};

export function DictationButton({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const t = useT();
  const lang = useLang();
  // Known only in the browser; the server renders nothing.
  const supported = useSyncExternalStore(noSubscribe, () => Boolean(recognizer()), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fallbackLang: DictateLang = lang === "pt" ? PT_BR : EN_US;
  const dictateLang = useSyncExternalStore(subscribeLang, () => readDictateLang(fallbackLang), () => fallbackLang);
  const switchLang = () => {
    const next: DictateLang = dictateLang === PT_BR ? EN_US : PT_BR;
    try {
      localStorage.setItem(DICTATE_LANG_KEY, next);
    } catch {
      // private mode: nothing to remember, the switch has no effect
    }
    langListeners.forEach((cb) => cb());
  };
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = recognizer();
    if (!R) return;
    const r = new R();
    r.lang = dictateLang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      said = said.trim();
      if (!said) return;
      const before = latest.current;
      onChange(before && !/\s$/.test(before) ? `${before} ${said}` : `${before}${said}`);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      setError(e.error === "not-allowed" ? t("Allow the microphone for this site to dictate.") : null);
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        className={cn("inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm", listening ? "border-bad-fg bg-bad-bg text-bad-fg" : "text-muted-foreground hover:bg-muted")}
      >
        {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
        {listening ? t("Stop dictating") : t("Dictate")}
      </button>
      <button
        type="button"
        onClick={switchLang}
        disabled={disabled || listening}
        aria-label={t("Dictation language: {lang}. Tap to switch.", { lang: dictateLang === PT_BR ? "Português" : "English" })}
        className="inline-flex h-11 items-center rounded-lg border px-2.5 text-xs font-semibold tracking-wide text-muted-foreground hover:bg-muted"
      >
        {dictateLang === PT_BR ? "PT" : "EN"}
      </button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
