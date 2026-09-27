import { PlatformReportForm } from "@/components/platform-report-form";

export const metadata = { title: "Report a managed store" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ instance?: string }> }) {
  const params = await searchParams;
  return <PlatformReportForm initialDomain={String(params.instance || "").slice(0, 240)} />;
}
