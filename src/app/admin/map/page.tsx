import { requireScreen } from "@/lib/screen-guard";
import Link from "next/link";
import DisasterMap from "@/components/map/DisasterMap";

export const metadata = { title: "Live GIS Map — Command Centre" };

export default async function AdminMapPage() {
  await requireScreen("map");
  return (
    <div className="-m-3 rounded-xl bg-ink-950 p-2 sm:-m-5 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300">Common operating picture</p>
          <h1 className="text-base font-extrabold text-white sm:text-lg">Tamil Nadu operational GIS map</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Link href="/admin/incidents" className="rounded-md border border-white/15 px-2 py-1 font-semibold text-slate-200 hover:bg-white/10">Incident console</Link>
          <Link href="/admin/facilities" className="rounded-md border border-white/15 px-2 py-1 font-semibold text-slate-200 hover:bg-white/10">Facilities</Link>
          <Link href="/admin/sos" className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700">SOS monitoring</Link>
        </div>
      </div>
      <DisasterMap mode="admin" />
    </div>
  );
}
