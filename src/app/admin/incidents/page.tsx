import { requireScreen } from "@/lib/screen-guard";
import IncidentConsole from "@/components/admin/IncidentConsole";

export const metadata = { title: "Incident Management — DisasterLink" };

export default async function AdminIncidentsPage() {
  await requireScreen("incidents");
  return <IncidentConsole />;
}
