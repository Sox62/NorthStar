import PageHeader from "@/components/PageHeader";
import { Card, SummaryGrid } from "@/northstar/components";

const downloads = [
  {
    title: "Consolidated wealth statement",
    owner: "Overall",
    href: "/api/reports/wealth-statement?scope=overall",
    detail: "Accounts, holdings, allocations, drift, currency exposure and returns.",
    rows: "Full portfolio",
  },
  {
    title: "Personal report",
    owner: "Personal",
    href: "/api/reports/wealth-statement?scope=personal",
    detail: "Personal holdings, exposures, allocation drift and period returns.",
    rows: "Personal scope",
  },
  {
    title: "SMSF report",
    owner: "SMSF",
    href: "/api/reports/wealth-statement?scope=smsf",
    detail: "SMSF holdings, exposures, allocation drift and period returns.",
    rows: "SMSF scope",
  },
  {
    title: "Estate summary",
    owner: "Ownership",
    href: "/api/reports/estate-summary",
    detail: "Ownership-separated assets, accounts and net asset value.",
    rows: "Personal and SMSF",
  },
  {
    title: "Tax position",
    owner: "Tax",
    href: "/api/reports/tax-position",
    detail: "Unrealised gain/loss position by legal owner from current cost basis.",
    rows: "CGT position",
  },
];

export default function ReportsPage() {
  return (
    <main className="shell">
      <PageHeader
        title="Reports"
        description="Download repeatable CSV outputs for consolidated, Personal, SMSF and estate review."
        links={[
          { href: "/", label: "Dashboard" },
          { href: "/targets", label: "Targets" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className="reportsHero">
        <Card className="reportsSummaryCard">
          <p className="eyebrow">Report set</p>
          <h2 className="cardTitle">Production CSV exports</h2>
          <p className="cardIntro">Generated directly from the stored NorthStar portfolio data.</p>
          <SummaryGrid
            entries={[
              ["Exports", downloads.length],
              ["Format", "CSV"],
              ["Scopes", "Overall, Personal, SMSF"],
              ["Estate", "Ownership-aware"],
            ]}
          />
        </Card>

        <Card>
          <p className="eyebrow">Current coverage</p>
          <h2 className="cardTitle">Ready now</h2>
          <div className="reportCoverage">
            <span>Wealth statement</span>
            <span>Personal report</span>
            <span>SMSF report</span>
            <span>Estate summary</span>
            <span>Tax position</span>
          </div>
        </Card>
      </section>

      <Card className="reportListCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Downloads</p>
            <h2 className="cardTitle">Report files</h2>
          </div>
          <span className="panelCount">{downloads.length} exports</span>
        </div>

        <div className="reportList">
          {downloads.map((download) => (
            <article className="reportRow" key={download.href}>
              <div>
                <div className="reportRowHeader">
                  <strong>{download.title}</strong>
                  <span>{download.owner}</span>
                </div>
                <p>{download.detail}</p>
                <small>{download.rows}</small>
              </div>
              <a className="button primary" href={download.href}>
                Download CSV
              </a>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
