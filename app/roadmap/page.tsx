import PageHeader from "@/components/PageHeader";
import { roadmapPhases, roadmapSummary, statusLabels, type RoadmapStatus } from "@/lib/roadmap";
import { Card, SummaryGrid } from "@/northstar/components";

const statusClass: Record<RoadmapStatus, string> = {
  shipped: "isShipped",
  in_progress: "isInProgress",
  planned: "isPlanned",
  blocked: "isBlocked",
};

export default function RoadmapPage() {
  const summary = roadmapSummary();

  return (
    <main className="shell">
      <PageHeader
        title="NorthStar 1.0 roadmap"
        description="Implementation plan for turning the current private portfolio dashboard into a production-grade portfolio operating system."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/sync", label: "Sync" },
          { href: "/sectors", label: "Sectors" },
        ]}
      />

      <section className="roadmapHero">
        <Card className="roadmapSummaryCard">
          <p className="eyebrow">Delivery status</p>
          <h2 className="cardTitle">{summary.percentComplete}% of tracked work shipped</h2>
          <p className="cardIntro">This is a delivery tracker, not a marketing page. Shipped means working in the deployed product or wired into the current codebase.</p>
          <div className="roadmapProgress" aria-label={`${summary.percentComplete}% complete`}>
            <span style={{ width: `${summary.percentComplete}%` }} />
          </div>
        </Card>

        <Card>
          <p className="eyebrow">Work breakdown</p>
          <SummaryGrid
            entries={[
              ["Tracked items", String(summary.total)],
              ["Shipped", String(summary.counts.shipped)],
              ["In progress", String(summary.counts.in_progress)],
              ["Planned", String(summary.counts.planned)],
            ]}
          />
        </Card>
      </section>

      <section className="roadmapGrid" aria-label="NorthStar roadmap phases">
        {roadmapPhases.map((phase) => (
          <Card key={phase.id} className="roadmapPhaseCard">
            <div className="roadmapPhaseHeader">
              <div>
                <p className="eyebrow">{phase.phase}</p>
                <h2 className="cardTitle">{phase.title}</h2>
              </div>
              <span className={`roadmapStatus ${statusClass[phase.status]}`}>{statusLabels[phase.status]}</span>
            </div>
            <p className="cardIntro">{phase.objective}</p>
            <div className="roadmapItems">
              {phase.items.map((item) => (
                <article key={item.title} className="roadmapItem">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className={`roadmapStatus ${statusClass[item.status]}`}>{statusLabels[item.status]}</span>
                </article>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
