import IntelligenceClient from "@/components/citizen/IntelligenceClient";
import AiIntelligencePanel from "@/components/intel/AiIntelligencePanel";

export const metadata = { title: "Disaster Intelligence Engine — DisasterLink" };

export default function IntelligencePage() {
  return (
    <div className="space-y-6">
      <IntelligenceClient />
      <AiIntelligencePanel mode="citizen" />
    </div>
  );
}
