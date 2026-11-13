import { requireScreen } from "@/lib/screen-guard";
import FacilityOperationsConsole from "@/components/admin/FacilityOperationsConsole";

export const metadata = { title: "Safety Zones & Shelters — Command Centre" };

export default async function AdminSheltersPage() {
  await requireScreen("shelters");
  return <FacilityOperationsConsole kind="SHELTER" />;
}
