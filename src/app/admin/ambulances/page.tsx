import { requireScreen } from "@/lib/screen-guard";
import FacilityOperationsConsole from "@/components/admin/FacilityOperationsConsole";

export const metadata = { title: "Ambulance Management — Command Centre" };

export default async function AdminAmbulancesPage() {
  await requireScreen("ambulances");
  return <FacilityOperationsConsole kind="AMBULANCE_SERVICE" />;
}
