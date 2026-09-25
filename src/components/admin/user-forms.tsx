"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { inviteUserAction, saveGroupAction, sendPasswordLinkAction, setUserGroupsAction, updateUserAction } from "@/lib/admin/user-actions";

export type GroupChoice = { id: number; name: string; system: boolean; active: boolean };

const INPUT = "h-11 w-full rounded-lg border bg-background px-3 text-base";
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

/** Group checkboxes. Built-in groups are locked for non-System Administrators (the database enforces it too). */
function GroupPicker({ groups, value, onChange, disabled, isSysadmin }: { groups: GroupChoice[]; value: number[]; onChange: (v: number[]) => void; disabled?: boolean; isSysadmin: boolean }) {
  return (
    <fieldset className="rounded-lg border p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">Groups</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {groups
          .filter((g) => g.name !== "Everyone")
          .map((g) => (
            <label key={g.id} className={`flex min-h-11 items-center gap-3 rounded-md px-2 ${g.system && !isSysadmin ? "opacity-50" : "hover:bg-muted/50"}`}>
              <input
                type="checkbox"
                className="size-5"
                checked={value.includes(g.id)}
                disabled={g.system && !isSysadmin}
                onChange={(e) => onChange(e.target.checked ? [...value, g.id] : value.filter((x) => x !== g.id))}
              />
              <span className="text-base">
                {g.name}
                {!g.active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
              </span>
            </label>
          ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Everyone is included automatically.</p>
    </fieldset>
  );
}

function LinkBox({ link, emailed }: { link: string; emailed: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="mb-2">
        {emailed ? "The sign-up link was emailed (in test mode it goes to the test inbox only)." : "The email could not be sent."} You can also copy the link and text it. It works once, for 24 hours.
      </p>
      <button
        type="button"
        className={BTN}
        onClick={() => {
          void navigator.clipboard.writeText(link);
          toast.success("Link copied");
        }}
      >
        <Copy className="size-4" aria-hidden /> Copy sign-up link
      </button>
    </div>
  );
}

export function InviteForm({ groups, canSetGroups, isSysadmin }: { groups: GroupChoice[]; canSetGroups: boolean; isSysadmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [groupIds, setGroups] = useState<number[]>([]);
  const [done, setDone] = useState<{ link: string; emailed: boolean; userId: string } | null>(null);

  if (done)
    return (
      <div className="space-y-4">
        <p className="text-base">
          Login created for <strong>{email}</strong>.
        </p>
        <LinkBox link={done.link} emailed={done.emailed} />
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => router.push(`/admin/users/${done.userId}`)}>
            Open user
          </button>
          <button type="button" className={BTN} onClick={() => router.push("/admin/users")}>
            Back to users
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
          const r = await inviteUserAction({ email, firstName, lastName, groupIds });
          if (!r.ok) return void toast.error(r.message);
          setDone({ link: r.link ?? "", emailed: Boolean(r.emailed), userId: r.userId ?? "" });
        });
      }}
    >
      <Field label="Email">
        <input className={INPUT} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input className={INPUT} required value={firstName} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={INPUT} value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      {canSetGroups && <GroupPicker groups={groups} value={groupIds} onChange={setGroups} isSysadmin={isSysadmin} />}
      <button type="submit" disabled={pending} className={PRIMARY}>
        Create login and send sign-up link
      </button>
    </form>
  );
}

type UserProps = {
  userId: string;
  email: string;
  initial: { firstName: string; lastName: string; active: boolean; groupIds: number[] };
  groups: GroupChoice[];
  can: { edit: boolean; groups: boolean; link: boolean };
  isSysadmin: boolean;
  isMe: boolean;
};

export function UserForm({ userId, email, initial, groups, can, isSysadmin, isMe }: UserProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [firstName, setFirst] = useState(initial.firstName);
  const [lastName, setLast] = useState(initial.lastName);
  const [active, setActive] = useState(initial.active);
  const [groupIds, setGroups] = useState(initial.groupIds);
  const [link, setLink] = useState<{ link: string; emailed: boolean } | null>(null);

  const save = () =>
    start(async () => {
      if (can.edit) {
        const r = await updateUserAction(userId, { firstName, lastName, active });
        if (!r.ok) return void toast.error(r.message);
      }
      if (can.groups) {
        const r = await setUserGroupsAction(userId, groupIds);
        if (!r.ok) return void toast.error(r.message);
      }
      toast.success("Saved");
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
      <Field label="Email">
        <input className={`${INPUT} bg-muted`} value={email} readOnly />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input className={INPUT} required disabled={!can.edit} value={firstName} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={INPUT} disabled={!can.edit} value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5" checked={active} disabled={!can.edit || isMe} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-base">Active (can sign in)</span>
      </label>
      <GroupPicker groups={groups} value={groupIds} onChange={setGroups} disabled={!can.groups} isSysadmin={isSysadmin} />
      <div className="flex flex-wrap gap-2">
        {(can.edit || can.groups) && (
          <button type="submit" disabled={pending} className={PRIMARY}>
            Save
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
                if (!r.ok) return void toast.error(r.message);
                setLink({ link: r.link ?? "", emailed: Boolean(r.emailed) });
              })
            }
          >
            <KeyRound className="size-4" aria-hidden /> Send set-password link
          </button>
        )}
      </div>
      {link && <LinkBox {...link} />}
    </form>
  );
}

export function GroupForm({ groupId, initial, editable }: { groupId: number | null; initial: { name: string; active: boolean }; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [active, setActive] = useState(initial.active);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveGroupAction(groupId, { name, active });
          if (!r.ok) return void toast.error(r.message);
          toast.success("Saved");
          if (!groupId && r.id) router.push(`/admin/groups/${r.id}`);
          else router.refresh();
        });
      }}
    >
      <Field label="Group name">
        <input className={INPUT} required disabled={!editable} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5" disabled={!editable} checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-base">Active (an inactive group grants nothing)</span>
      </label>
      {editable && (
        <button type="submit" disabled={pending} className={PRIMARY}>
          {groupId ? "Save" : "Create group"}
        </button>
      )}
    </form>
  );
}
