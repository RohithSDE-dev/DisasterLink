import { Accordion } from "@/components/interactive";
import { Notice, SectionHeading, SourceBadge } from "@/components/ui";
import { SAFETY_TOPICS } from "@/lib/safety";

export const metadata = { title: "Safety Instructions — DisasterLink" };

export default function SafetyPage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Preparedness"
        title="Safety instructions"
        description="Practical, general guidance for Tamil Nadu conditions. This is preparedness information, not an official advisory. Always follow instructions from local authorities and trained responders."
        action={<SourceBadge source="COMMUNITY_REPORT" />}
      />

      <Notice tone="danger" title="Life-threatening emergency">
        Call <a className="font-bold underline" href="tel:112">112</a> immediately. Also automatically notify emergency services are
        not dispatched by DisasterLink.
      </Notice>

      <Accordion
        items={SAFETY_TOPICS.map((topic) => ({
          title: topic.title,
          body: (
            <div>
              <p className="mb-3">{topic.intro}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Before", rows: topic.before, tone: "bg-blue-50 text-blue-900 ring-blue-200" },
                  { label: "During", rows: topic.during, tone: "bg-amber-50 text-amber-900 ring-amber-200" },
                  { label: "After", rows: topic.after, tone: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
                ].map((block) => (
                  <div key={block.label} className={`rounded-lg px-3 py-2.5 ring-1 ring-inset ${block.tone}`}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide">{block.label}</p>
                    <ul className="space-y-1.5 text-[11px] leading-relaxed">
                      {block.rows.map((row) => (
                        <li key={row} className="flex gap-1.5">
                          <span aria-hidden>•</span>
                          <span>{row}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ),
        }))}
      />

      <div className="card card-pad">
        <h2 className="text-sm font-bold text-slate-900">Emergency numbers (public)</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["112", "Emergency response"],
            ["108", "Ambulance"],
            ["101", "Fire & Rescue"],
            ["1078", "Disaster control room"],
            ["1091", "Women helpline"],
            ["1098", "Child helpline"],
          ].map(([number, label]) => (
            <a key={number} href={`tel:${number}`} className="rounded-lg border border-slate-200 px-2.5 py-2 hover:border-blue-300 hover:bg-blue-50">
              <p className="text-base font-extrabold text-slate-900">{number}</p>
              <p className="text-[10px] text-slate-500">{label}</p>
            </a>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Facility-specific contacts are not displayed because they are not verified in this prototype.
        </p>
      </div>
    </div>
  );
}
