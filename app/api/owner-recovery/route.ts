import { created, fail, ok, sameOrigin } from "@/lib/api";
import { isAuthConfigured, setSession } from "@/lib/auth";
import { getDb, getMongoClient } from "@/lib/db";
import {
  claimOwnerRecovery, inspectOwnerRecovery, OwnerRecoveryError,
  ownerRecoveryRequestSchema, readOwnerRecoveryJson,
} from "@/lib/owner-recovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  if (!isAuthConfigured()) return fail("Authentication is not configured on this deployment.", 503);
  try {
    const input = ownerRecoveryRequestSchema.safeParse(await readOwnerRecoveryJson(request));
    if (!input.success) return fail("Check the highlighted recovery details.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    if (input.data.action === "INSPECT") return ok(await inspectOwnerRecovery(db, input.data.token));
    const user = await claimOwnerRecovery(db, await getMongoClient(), input.data);
    try {
      await setSession(user, db);
      return created({ redirectTo: "/dashboard" });
    } catch {
      // The new account is already committed. Never report a creation failure or
      // consume another grant merely because the browser session could not be set.
      return created({ redirectTo: "/login?ownerRecovered=1", signInRequired: true });
    }
  } catch (error) {
    if (error instanceof OwnerRecoveryError) return fail(error.message, error.status);
    // Recovery capabilities and passwords must never reach generic error logging.
    return fail("Owner recovery is temporarily unavailable. Try again, or sign in if your account was already created.", 503);
  }
}
