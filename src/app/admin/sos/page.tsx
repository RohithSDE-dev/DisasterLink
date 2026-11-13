import { requireScreen } from "@/lib/screen-guard";
import SosConsole from "@/components/admin/SosConsole";

export const metadata = { title: "SOS Control — DisasterLink" };

export default async function AdminSosPage() {
  await requireScreen("sos");
  return <SosConsole />;
}
