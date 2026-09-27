import { blockRestrictedPlatform, fail, ok, publicError } from "@/lib/api";
import { validCronRequest } from "@/lib/cron-auth";
import { getDb, getMongoClient } from "@/lib/db";
import { generateDueRecurringInvoices } from "@/lib/recurring-invoice-generator";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!validCronRequest(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    return ok(await generateDueRecurringInvoices(
      await getDb(),
      await getMongoClient(),
      { id: "recurring-invoice-scheduler", username: "system", fullName: "Recurring invoice scheduler", role: "SYSTEM" },
      new Date(),
      25,
    ));
  } catch (error) { return publicError(error); }
}
