import { requireScreen } from "@/lib/screen-guard";
import Link from "next/link";
import AiIntelligencePanel from "@/components/intel/AiIntelligencePanel";
import { Notice, SectionHeading } from "@/components/ui";

export const metadata = { title: "District Intelligence — Command Centre" };

export default async function AdminDistrictsPage() {
  await requireScreen("districts");
  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="District intelligence"
        title="District-level risk, reporting and demand"
        description="Select a district to scope the analysis. Every figure is computed live from the records this command centre manages."
        action={
          <div className="flex flex-wrap gap-1.5">
            <Link href="/admin/weather" className="btn-outline btn-sm">Weather intelligence</Link>
            <Link href="/admin/reports" className="btn-outline btn-sm">Reports</Link>
          </div>
        }
      />
      <Notice tone="info" title="Interpretation">
        Cluster counts include unverified citizen reports; only verified incidents are publishable. Resource demand is a planning heuristic and
        does not authorise allocation — assignments remain a deliberate administrator action.
      </Notice>
      <AiIntelligencePanel mode="admin" />
    </div>
  );
}
