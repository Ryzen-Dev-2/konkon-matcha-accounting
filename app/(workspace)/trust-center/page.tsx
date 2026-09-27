import { redirect } from "next/navigation";
import { TrustCenterView } from "@/components/trust-center-view";
import { readSession } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const metadata = { title: "Trust & safety" };

export default async function TrustCenterPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, "owner.control")) redirect("/dashboard");
  return <TrustCenterView />;
}
