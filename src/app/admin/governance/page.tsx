import { requireScreen } from "@/lib/screen-guard";
import GovernanceConsole from "@/components/admin/GovernanceConsole";

export const metadata = { title: "Governance — DisasterLink Command Centre" };

export default async function AdminGovernancePage() {
  await requireScreen("governance");
  return <GovernanceConsole />;
}
