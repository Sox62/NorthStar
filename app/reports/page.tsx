import PageHeader from "@/components/PageHeader";
import { Card, SummaryGrid } from "@/northstar/components";
import styles from "./ReportsPage.module.css";

type ReportDownload = {
  title: string;
  owner: string;
  href: string;
  detail: string;
  rows: string;
  reportHref?: string;
  downloadLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const downloads: ReportDownload[] = [
  {
    title: "Consolidated wealth statement",
    owner: "Overall",
    href: "/api/reports/wealth-statement?scope=overall",
    reportHref: "/reports/wealth?scope=overall",
    detail: "Accounts, holdings, allocations, drift, currency exposure, returns.",
    rows: "Full portfolio",
  },
  {
    title: "Personal report",
    owner: "Personal",
    href: "/api/reports/wealth-statement?scope=personal",
    reportHref: "/reports/wealth?scope=personal",
    detail: "Personal holdings, exposures, allocation drift, period returns.",
    rows: "Personal scope",
  },
  {
    title: "SMSF report",
    owner: "SMSF",
    href: "/api/reports/wealth-statement?scope=smsf",
    reportHref: "/reports/wealth?scope=smsf",
    detail: "SMSF holdings, exposures, allocation drift, period returns.",
    rows: "SMSF scope",
  },
  {
    title: "Personal EOFY accountant pack",
    owner: "Personal",
    href: "/api/reports/eofy?scope=personal&format=xlsx",
    reportHref: "/reports/eofy?scope=personal",
    downloadLabel: "Download XLSX",
    secondaryHref: "/api/reports/eofy?scope=personal&format=csv",
    secondaryLabel: "CSV",
    detail: "AU Personal tax pack with Sharesight-style XLSX tabs for CGT, taxable income, all trades, historical cost and unrealised CGT, plus NorthStar reconciliation.",
    rows: "AU Personal tax only",
  },
  {
    title: "Estate summary",
    owner: "Ownership",
    href: "/api/reports/estate-summary",
    detail: "Ownership-separated assets, accounts, net asset value.",
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
        description="Download CSV outputs or open print-ready report pages. The EOFY accountant tax pack is AU Personal only; SMSF remains separate."
        links={[
          { href: "/", label: "Dashboard" },
          { href: "/tax", label: "Tax lots" },
          { href: "/targets", label: "Targets" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className={styles.hero}>
        <Card className={styles.summaryCard}>
          <p className="eyebrow">Report set</p>
          <h2 className="cardTitle">CSV, PDF-ready and personal tax reports</h2>
          <p className="cardIntro">Generated directly from stored NorthStar portfolio data. AU is live for the Personal accountant pack; UK and US are reserved as separate tax jurisdictions for future reporting.</p>
          <SummaryGrid
            entries={[
              ["Exports", downloads.length],
              ["Format", "CSV + print"],
              ["Tax", "AU live, UK/US reserved"],
              ["Scopes", "Overall, Personal, SMSF"],
              ["Estate", "Ownership-aware"],
            ]}
          />
        </Card>

        <Card>
          <p className="eyebrow">Current coverage</p>
          <h2 className="cardTitle">Ready now</h2>
          <div className={styles.coverage}>
            <span>Wealth statement</span>
            <span>Personal report</span>
            <span>SMSF report</span>
            <span>AU Personal EOFY accountant pack</span>
            <span>Jurisdiction metadata in CSV/XLSX</span>
            <span>Print / Save PDF views</span>
            <span>Estate summary</span>
            <span>Tax position</span>
            <span>Tax-lot workbench</span>
          </div>
        </Card>
      </section>

      <Card>
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Downloads</p>
            <h2 className="cardTitle">Report files</h2>
          </div>
          <span className="panelCount">{downloads.length} exports</span>
        </div>

        <div className={styles.list}>
          {downloads.map((download) => (
            <article className={styles.row} key={download.href}>
              <div>
                <div className={styles.rowHeader}>
                  <strong>{download.title}</strong>
                  <span>{download.owner}</span>
                </div>
                <p>{download.detail}</p>
                <small>{download.rows}</small>
              </div>
              <div className={styles.actions}>
                {download.reportHref ? <a className="button" href={download.reportHref}>Open report</a> : null}
                {download.secondaryHref ? <a className="button" href={download.secondaryHref}>{download.secondaryLabel ?? "Download"}</a> : null}
                <a className="button primary" href={download.href}>
                  {download.downloadLabel ?? "Download CSV"}
                </a>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
