"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { connectGmailAction } from "@/lib/mail/actions";
import { useT } from "@/i18n/client";

// F26-2: Admin › Gmail intake › Connect — the mailbox address and its Gmail app password (kept encrypted).

export function GmailConnectForm({ mailbox }: { mailbox: string }) {
  const t = useT();
  const router = useRouter();
  const [account, setAccount] = useState(mailbox);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectGmailAction(account, password);
      if (!r.ok) return void toast.error(t(r.message));
      setPassword("");
      toast.success(t("Mailbox connected. The first check reads the last 30 days."));
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("Mailbox")}</span>
        <input type="email" value={account} onChange={(e) => setAccount(e.target.value)} required autoComplete="off" className="h-11 rounded-[10px] border bg-background px-3 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("App password (16 letters, from myaccount.google.com/apppasswords)")}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" inputMode="text" className="h-11 rounded-[10px] border bg-background px-3 text-base tracking-widest" />
      </label>
      <button type="submit" disabled={pending || !password.trim()} className="inline-flex h-11 w-fit items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("Connect the mailbox")}
      </button>
    </form>
  );
}
