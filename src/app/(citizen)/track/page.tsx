import TrackClient from "@/components/citizen/TrackClient";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "My Reports — DisasterLink" };

export default async function TrackPage() {
  const user = await getSessionUser().catch(() => null);
  return <TrackClient signedIn={Boolean(user)} />;
}
