import Link from "next/link";
import DisasterMap from "@/components/map/DisasterMap";

export const metadata = { title: "3D Tamil Nadu Map — DisasterLink" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ district?: string }> }) {
  const { district } = await searchParams;
  return (
    <div className="-mx-3 -my-5 bg-ink-950 px-2 py-2 sm:-mx-6 sm:-my-7 sm:px-3 sm:py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300">Phase 1 · Geospatial operations</p>
          <h1 className="text-base font-extrabold text-white sm:text-lg">Tamil Nadu disaster GIS</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Link href="/districts" className="rounded-md border border-white/15 px-2 py-1 font-semibold text-slate-200 hover:bg-white/10">2D district explorer</Link>
          <Link href="/facilities" className="rounded-md border border-white/15 px-2 py-1 font-semibold text-slate-200 hover:bg-white/10">Facility directory</Link>
          <Link href="/sos" className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700">SOS</Link>
        </div>
      </div>
      <DisasterMap mode="citizen" initialDistrict={district?.toUpperCase() ?? null} />
    </div>
  );
}
