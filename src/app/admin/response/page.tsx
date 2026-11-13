import { requireScreen } from "@/lib/screen-guard";
import ResponseConsole from "@/components/admin/ResponseConsole";

export const metadata = { title: "Teams & Resources — DisasterLink Command Centre" };

export default async function AdminResponsePage() {
  await requireScreen("response");
  return <ResponseConsole />;
}
