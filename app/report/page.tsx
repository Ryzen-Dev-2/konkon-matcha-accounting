import { PlatformReportForm } from "@/components/platform-report-form";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normaliseOrigin } from "@/lib/platform-trust";
import { OFFICIAL_PLATFORM_ORIGIN, OFFICIAL_REPORT_URL } from "@/lib/platform-public";

export const metadata = { title: "Report a managed store" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ instance?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "").split(",")[0].trim().toLowerCase();
  const officialHost = new URL(OFFICIAL_PLATFORM_ORIGIN).host;
  const currentOrigin = normaliseOrigin(`${(requestHeaders.get("x-forwarded-proto") || "https").split(",")[0]}://${host}`, true);
  const instance = normaliseOrigin(String(params.instance || ""), false) || (host !== officialHost ? currentOrigin : "");
  if (process.env.NODE_ENV === "production" && host && host !== officialHost) {
    redirect(`${OFFICIAL_REPORT_URL}${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`);
  }
  return <PlatformReportForm initialDomain={instance.slice(0, 240)} />;
}
