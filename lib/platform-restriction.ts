import type { Db } from "mongodb";
import { getDb } from "@/lib/db";
import { syncManagedPolicy } from "@/lib/platform-enrollment";
import { platformRestrictionFromControl } from "@/lib/platform-trust";
import { getSystemControl } from "@/lib/system-control";

const CACHE_MS = 10_000;
const POLICY_REFRESH_MS = 60_000;
let nextRefreshCheckAt = 0;
let refreshInFlight: Promise<void> | null = null;

async function refreshPolicyIfDue(db: Db) {
  const enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
  if (!enrollment) return;
  const lastSync = enrollment.lastSyncAt instanceof Date ? enrollment.lastSyncAt.getTime() : 0;
  if (Date.now() - lastSync <= POLICY_REFRESH_MS) return;
  try {
    await syncManagedPolicy(db, enrollment);
  } catch {
    // Keep enforcing the last verified signed policy when the authority is unreachable.
  }
}

export async function getEffectiveSystemControl(database?: Db) {
  const db = database || await getDb();
  if (Date.now() >= nextRefreshCheckAt) {
    refreshInFlight ||= refreshPolicyIfDue(db).finally(() => { refreshInFlight = null; });
    await refreshInFlight;
    nextRefreshCheckAt = Date.now() + CACHE_MS;
  }
  return getSystemControl(db);
}

export async function getPlatformRestriction(database?: Db) {
  return platformRestrictionFromControl(await getEffectiveSystemControl(database));
}
