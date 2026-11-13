import NotificationsClient from "@/components/citizen/NotificationsClient";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Notifications — DisasterLink" };

export default async function NotificationsPage() {
  const user = await getSessionUser().catch(() => null);
  return <NotificationsClient signedIn={Boolean(user)} />;
}
