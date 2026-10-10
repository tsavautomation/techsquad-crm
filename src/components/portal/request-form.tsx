"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadFile, type UploadActions } from "@/lib/files/upload-file";
import type { Progress } from "@/lib/files/resumable";
import { createRequestAction, portalCanResumeAction, portalFinishOneDriveAction, portalPreviewUrlAction, portalUploadAction } from "@/lib/portal/actions";
import type { FileItem } from "@/lib/records/values";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const ACTIONS: UploadActions = { create: portalUploadAction, finish: portalFinishOneDriveAction, canResume: portalCanResumeAction, previewUrl: portalPreviewUrlAction };
const KINDS = ["Service call", "Something stopped working", "Question", "Other"] as const;

/** The customer's request: what kind, what is going on, photos / videos from the phone. No date picking. */
export function RequestForm({ projectId }: { projectId: number }) {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("Service call");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<(FileItem & { local?: string })[]>([]);
  const [busy, setBusy] = useState<Record<string, Progress>>({});
  const [saving, setSaving] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploading = Object.values(busy).some((p) => p.state !== "done");

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    for (const file of [...list]) {
      const local = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setBusy((b) => ({ ...b, [file.name]: { sent: 0, total: file.size, state: "sending" } }));
      try {
        const r = await uploadFile("service_requests", "media", null, file, (p) => setBusy((b) => ({ ...b, [file.name]: p })), ACTIONS);
        if (!r.ok) {
          toast.error(t(r.message));
          continue;
        }
        setMedia((m) => [...m, { ...r.item, local }]);
      } finally {
        setBusy((b) => {
          const { [file.name]: _, ...rest } = b;
          void _;
          return rest;
        });
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error(t("Tell us what is going on."));
      return;
    }
    setSaving(true);
    const r = await createRequestAction({ projectId, kind, description, media: media.map(({ path, name, mime, size }) => ({ path, name, mime, size })) });
    setSaving(false);
    if (!r.ok) {
      toast.error(t(r.message));
      return;
    }
    toast.success(t("Request sent. Our office will call you to confirm."));
    router.push(`/portal/p/${projectId}/requests`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("What do you need?")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("min-h-11 rounded-xl border px-3 py-2 text-sm", kind === k ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>
              {t(k)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t("Tell us what is going on")}</Label>
        <textarea
          id="description"
          name="description"
          required
          maxLength={2000}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("Which room, which device, what happens, since when…")}
          className="w-full rounded-xl border bg-card px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("Photos or a short video (optional)")}</p>
        <p className="text-xs text-muted-foreground">{t("A picture of the device, the error on the screen or the rack helps us bring the right part.")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" aria-hidden /> {t("Camera")}
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => pickRef.current?.click()}>
            <Paperclip className="size-4" aria-hidden /> {t("Choose files")}
          </Button>
          <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => void upload(e.target.files)} />
          <input ref={pickRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
        </div>
        {(media.length > 0 || Object.keys(busy).length > 0) && (
          <ul className="grid grid-cols-3 gap-2">
            {media.map((m) => (
              <li key={m.path} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
                {m.local ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.local} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center p-2 text-center text-xs break-all">{m.name}</span>
                )}
                <button type="button" onClick={() => setMedia((list) => list.filter((x) => x.path !== m.path))} aria-label={t("Remove {name}", { name: m.name })} className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
            {Object.entries(busy).map(([name, p]) => (
              <li key={name} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-muted p-2 text-center text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {p.total ? `${Math.round((p.sent / p.total) * 100)}%` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button type="submit" className="h-12 text-base" disabled={saving || uploading}>
        {saving ? t("Sending…") : uploading ? t("Waiting for the upload…") : t("Send request")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("You don't pick a date here: our office calls you to agree on one.")}</p>
    </form>
  );
}
