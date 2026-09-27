import { ObjectId } from "mongodb";
import { blockRestrictedPlatform, fail, ok, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { receiptScanToken, receiptTokenId } from "@/lib/scan-codes";
import { publicReceipt, validReceiptAccess, receiptAccessUrl } from "@/lib/receipt-access";
import { OwnerRecoveryError, readOwnerRecoveryJson } from "@/lib/owner-recovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const body = await readOwnerRecoveryJson(request) as { token?: unknown };
    const token = typeof body?.token === "string" ? receiptScanToken(body.token) : "";
    const id = receiptTokenId(token);
    if (!id) return fail("This receipt link is invalid or no longer available.", 404);
    const db = await getDb();
    const sale = await db.collection("sales").findOne({ _id: new ObjectId(id) });
    if (!sale || !validReceiptAccess(sale, token)) return fail("This receipt link is invalid or no longer available.", 404);
    return ok({ ...publicReceipt(sale), publicReceiptUrl: receiptAccessUrl(sale, process.env.NEXT_PUBLIC_APP_URL || request.url) });
  } catch (error) {
    if (error instanceof OwnerRecoveryError) return fail(error.message, error.status);
    return fail("The receipt service is temporarily unavailable.", 503);
  }
}
