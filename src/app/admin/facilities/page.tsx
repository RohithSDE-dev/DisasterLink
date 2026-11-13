import { requireScreen } from "@/lib/screen-guard";
import FacilityConsole from "@/components/admin/FacilityConsole";

export const metadata = { title: "Facilities — DisasterLink Command Centre" };

export default async function AdminFacilitiesPage() {
  await requireScreen("facilities");
  return <FacilityConsole />;
}
