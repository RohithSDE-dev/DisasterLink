import { requireScreen } from "@/lib/screen-guard";
import WeatherIntelConsole from "@/components/admin/WeatherIntelConsole";

export const metadata = { title: "Weather Intelligence — Command Centre" };

export default async function AdminWeatherPage() {
  await requireScreen("weather");
  return <WeatherIntelConsole />;
}
