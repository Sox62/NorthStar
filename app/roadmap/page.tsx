import PageHeader from "@/components/PageHeader";
import { roadmapPhases, roadmapSummary, statusLabels, type RoadmapStatus } from "@/lib/roadmap";
import { Card, SummaryGrid } from "@/northstar/components";
import styles from "./RoadmapPage.module.css";

const statusClass: Record<RoadmapStatus, string> = {
  shipped: styles.shipped,
  in_progress: styles.inProgress,
  planned: styles.planned,
  blocked: styles.blocked,
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

      <section className={styles.hero}>
        <Card className={styles.summaryCard}>
          <p className="eyebrow">Delivery status</p>
          <h2 className="cardTitle">{summary.percentComplete}% of tracked work shipped</h2>
          <p className="cardIntro">This is a delivery tracker, not a marketing page. Shipped means working in the deployed product or wired into the current codebase.</p>
          <div className={styles.progress} aria-label={`${summary.percentComplete}% complete`}>
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

      <section className={styles.grid} aria-label="NorthStar roadmap phases">
        {roadmapPhases.map((phase) => (
          <Card key={phase.id} className={styles.phaseCard}>
            <div className={styles.phaseHeader}>
              <div>
                <p className="eyebrow">{phase.phase}</p>
                <h2 className="cardTitle">{phase.title}</h2>
              </div>
              <span className={`${styles.status} ${statusClass[phase.status]}`}>{statusLabels[phase.status]}</span>
            </div>
            <p className="cardIntro">{phase.objective}</p>
            <div className={styles.items}>
              {phase.items.map((item) => (
                <article key={item.title} className={styles.item}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className={`${styles.status} ${statusClass[item.status]}`}>{statusLabels[item.status]}</span>
                </article>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
