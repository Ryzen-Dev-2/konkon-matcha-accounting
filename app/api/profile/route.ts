import { ObjectId } from "mongodb";
import { z } from "zod";
import { fail, ok, publicError, sameOrigin } from "@/lib/api";
import { hashPassword, readSession, setSession, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  const session = await readSession();
  if (!session) return fail("Your session has expired. Sign in again.", 401);
  try {
    const input = passwordSchema.safeParse(await request.json());
    if (!input.success) return fail("The new password must be at least 12 characters with upper and lowercase letters and a number.", 422);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(session.id), active: true });
    if (!user || !(await verifyPassword(input.data.currentPassword, String(user.passwordHash)))) return fail("The current password is incorrect.", 401);
    const sessionVersion = Number(user.sessionVersion || 0) + 1;
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(input.data.newPassword), mustChangePassword: false, sessionVersion, updatedAt: new Date() } },
    );
    await setSession({
      id: session.id,
      username: String(user.username),
      fullName: String(user.fullName),
      role: user.role,
      sessionVersion,
      mustChangePassword: false,
    }, db);
    await writeAudit(db, session, "user.password_change", "user", session.id);
    return ok({ changed: true });
  } catch (error) {
    return publicError(error);
  }
}
