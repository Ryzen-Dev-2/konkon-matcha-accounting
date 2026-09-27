import { ObjectId } from "mongodb";
import { fail, ok, publicError } from "@/lib/api";
import { readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { syncManagedPolicy } from "@/lib/platform-enrollment";
import { latestRelease } from "@/lib/platform-trust";
import { getSystemControl } from "@/lib/system-control";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session || !ObjectId.isValid(session.id)) return fail("Your session has expired. Sign in again.", 401);
  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(session.id), active: true }, { projection: { sessionVersion: 1, role: 1 } });
    if (!user || Number(user.sessionVersion || 0) !== Number(session.sessionVersion || 0)) return fail("Your access changed. Sign in again.", 401);
    const enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
    if (enrollment) {
      const lastSync = enrollment.lastSyncAt instanceof Date ? enrollment.lastSyncAt.getTime() : 0;
      if (Date.now() - lastSync > 60_000) {
        try { await syncManagedPolicy(db, enrollment); } catch { /* keep the last verified policy; never accept an unsigned fallback */ }
      }
    }
    const [control, current] = await Promise.all([
      getSystemControl(db),
      db.collection("platformEnrollments").findOne({ _id: "workspace" as never }, { projection: { encryptedSecret: 0 } }),
    ]);
    const release = latestRelease();
    return ok({
      status: control.platformStatus,
      reason: control.platformReason,
      checkedAt: control.platformCheckedAt,
      managed: Boolean(current),
      updateAvailable: Boolean(current?.latestReleaseSha && current.latestReleaseSha !== "unknown" && current.latestReleaseSha !== release.sha),
      updateUrl: String(current?.updateUrl || release.updateUrl),
    });
  } catch (error) {
    return publicError(error);
  }
}
