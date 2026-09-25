import "server-only";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { REGISTRY } from "@/registry";
import { applyToRegistry, type FieldSetting } from "@/registry/overrides";

// Loads Form settings and applies them to the registry for this server instance.
// Called by getSession() (every page and server action) and by the automation engine.
// Settings are global, so one copy per instance is right; other instances pick up a
// change within TTL_MS. Read with the service key because engines have no session.

const TTL_MS = 30_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load() {
  if (!hasAdminKey()) {
    loadedAt = Date.now(); // e.g. tests and local scripts: keep the registry as it is
    return;
  }
  const { data, error } = await adminDb().from("field_settings").select("table_name, field_name, label, required, help, sort_order, options");
  if (error) throw new Error(`Could not load form settings: ${error.message}`);
  applyToRegistry(REGISTRY, (data ?? []) as FieldSetting[]);
  loadedAt = Date.now();
}

export async function ensureFieldSettings(force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  inflight ??= load().finally(() => (inflight = null));
  await inflight;
}
