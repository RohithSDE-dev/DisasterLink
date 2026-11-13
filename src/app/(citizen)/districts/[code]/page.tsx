import DistrictIntelligence from "@/components/citizen/DistrictIntelligence";

export default async function DistrictIntelligencePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DistrictIntelligence code={code.toUpperCase()} />;
}
