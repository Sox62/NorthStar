import PageHeader from "@/components/PageHeader";
import { Card, SummaryGrid } from "@/northstar/components";

const downloads = [
  {
    title: "Consolidated wealth statement",
    owner: "Overall",
    href: "/api/reports/wealth-statement?scope=overall",
    reportHref: "/reports/wealth?scope=overall",
    detail: "Accounts, holdings, allocations, drift, currency exposure, returns and XIRR.",
    rows: "Full portfolio",
  },
  {
    title: "Personal report",
    owner: "Personal",
    href: "/api/reports/wealth-statement?scope=personal",
    reportHref: "/reports/wealth?scope=personal",
    detail: "Personal holdings, exposures, allocation drift, period returns and XIRR.",
    rows: "Personal scope",
  },
  {
    title: "SMSF report",
    owner: "SMSF",
    href: "/api/reports/wealth-statement?scope=smsf",
    reportHref: "/reports/wealth?scope=smsf",
    detail: "SMSF holdings, exposures, allocation drift, period returns and XIRR.",
    rows: "SMSF scope",
  },
  {
    title: "Personal EOFY accountant pack",
    owner: "Personal",
    href: "/api/reports/eofy?scope=personal&format=csv",
    reportHref: "/reports/eofy?scope=personal",
    detail: "Financial-year income, franking, withholding, realised CGT lots, trade movements and current holding reference.",
    rows: "Latest EOFY",
  },
  {
    title: "SMSF EOFY accountant pack",
    owner: "SMSF",
    href: "/api/reports/eofy?scope=smsf&format=csv",
    reportHref: "/reports/eofy?scope=smsf",
    detail: "SMSF financial-year income, tax credits, realised CGT lots, trade movements and current holding reference.",
    rows: "Latest EOFY",
  },
  {
    title: "Estate summary",
    owner: "Ownership",
    href: "/api/reports/estate-summary",
    detail: "Ownership-separated assets, accounts, net asset value and XIRR.",
    rows: "Personal and SMSF",
  },
  {
    title: "Tax position",
    owner: "Tax",
    href: "/api/reports/tax-position",
    reportHref: "/reports/tax",
    detail: "Unrealised gain/loss position by legal owner from current cost basis.",
    rows: "CGT position",
  },
];

export default function ReportsPage() {
  return (
    <main className="shell">
      <PageHeader
        title="Reports"
        description="Download CSV outputs or open print-ready report pages for consolidated, Personal, SMSF, EOFY accountant and tax review."
        links={[
          { href: "/", label: "Dashboard" },
          { href: "/tax", label: "Tax lots" },
          { href: "/targets", label: "Targets" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className="reportsHero">
        <Card className="reportsSummaryCard">
          <p className="eyebrow">Report set</p>
          <h2 className="cardTitle">CSV, PDF-ready and accountant reports</h2>
          <p className="cardIntro">Generated directly from stored NorthStar portfolio data. Open report pages can be printed or saved as PDFs from the browser.</p>
          <SummaryGrid
            entries={[
              ["Exports", downloads.length],
              ["Format", "CSV + print"],
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
            <span>EOFY accountant packs</span>
            <span>Print / Save PDF views</span>
            <span>Estate summary</span>
            <span>Tax position</span>
            <span>Tax-lot workbench</span>
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
              <div className="reportActions">
                {download.reportHref ? <a className="button" href={download.reportHref}>Open report</a> : null}
                <a className="button primary" href={download.href}>
                  Download CSV
                </a>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
