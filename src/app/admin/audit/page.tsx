import { requireScreen } from "@/lib/screen-guard";
import AuditConsole from "@/components/admin/AuditConsole";

export const metadata = { title: "Audit Logs — Command Centre" };

export default async function AdminAuditPage() {
  await requireScreen("audit");
  return <AuditConsole />;
}
