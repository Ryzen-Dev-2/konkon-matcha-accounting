import { decryptMemberToken } from "@/lib/member-cards";
import { appealSchema, isPlatformAuthority, latestRelease, observedNetworkAddress, secretsMatch, signPlatformPolicy, type PlatformPolicy } from "@/lib/platform-trust";
import { fail, ok, publicError } from "@/lib/api";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function secretContext(instanceId: string) {
  return `platform-instance:${instanceId}:v1`;
}

async function authenticatedInstance(request: Request, instanceId: string) {
  const provided = bearer(request);
  if (!provided || !instanceId) return null;
  const db = await getDb();
  const instance = await db.collection("platformInstances").findOne({ _id: instanceId as never });
  if (!instance?.encryptedSecret) return null;
  const secret = decryptMemberToken(String(instance.encryptedSecret), secretContext(instanceId));
  return secretsMatch(secret, provided) ? { db, instance, secret } : null;
}

export async function GET(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  try {
    const instanceId = new URL(request.url).searchParams.get("instanceId") || "";
    const authenticated = await authenticatedInstance(request, instanceId);
    if (!authenticated) return fail("Managed-instance credentials were rejected.", 401);
    const now = new Date();
    const release = latestRelease();
    const policy: PlatformPolicy = {
      instanceId,
      status: authenticated.instance.status,
      reason: String(authenticated.instance.statusReason || ""),
      version: Number(authenticated.instance.version || 1),
      issuedAt: now.toISOString(),
      nonce: crypto.randomUUID(),
      latestReleaseSha: release.sha,
      updateUrl: release.updateUrl,
    };
    await authenticated.db.collection("platformInstances").updateOne(
      { _id: instanceId as never },
      { $set: { lastSeenAt: now, lastSeenIp: observedNetworkAddress(request), updatedAt: now } },
    );
    return ok({ policy, signature: signPlatformPolicy(policy, authenticated.secret) });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return fail("The request body must be valid JSON.", 400); }
    const input = appealSchema.safeParse(body);
    if (!input.success) return fail("Check the appeal details.", 422, input.error.flatten().fieldErrors);
    const authenticated = await authenticatedInstance(request, input.data.instanceId);
    if (!authenticated) return fail("Managed-instance credentials were rejected.", 401);
    if (!authenticated.instance.status || !["SUSPENDED", "APPEAL"].includes(String(authenticated.instance.status))) {
      return fail("An appeal is available only for a suspended managed instance.", 409);
    }
    const now = new Date();
    await authenticated.db.collection("platformInstances").updateOne(
      { _id: input.data.instanceId as never },
      {
        $set: { status: "APPEAL", statusReason: "Appeal received; restrictions remain while a human reviewer checks it.", appealMessage: input.data.message, appealAt: now, updatedAt: now },
        $inc: { version: 1 },
        $push: { history: { $each: [{ action: "APPEAL", reason: input.data.message, at: now, actor: "INSTANCE_OWNER" }], $slice: -100 } } as never,
      },
    );
    return ok({ status: "APPEAL", message: "Your appeal was received. Restrictions remain until the platform Owner completes a human review." });
  } catch (error) {
    return publicError(error);
  }
}
