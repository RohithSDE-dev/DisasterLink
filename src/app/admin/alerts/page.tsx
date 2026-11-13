import { requireScreen } from "@/lib/screen-guard";
import AlertsPublisher from "@/components/admin/AlertsPublisher";

export const metadata = { title: "Alerts & Notifications — Command Centre" };

export default async function AdminAlertsPage() {
  await requireScreen("alerts");
  return <AlertsPublisher />;
}
