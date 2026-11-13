import { requireScreen } from "@/lib/screen-guard";
import AnalyticsConsole from "@/components/admin/AnalyticsConsole";

export const metadata = { title: "Analytics — DisasterLink Command Centre" };

export default async function AdminAnalyticsPage() {
  await requireScreen("analytics");
  return <AnalyticsConsole />;
}
