import type { DashboardData, DashboardHolding } from "@/lib/storage";
import { sectorForInstrument } from "@/southernstar/lib/sector-map";
import { Card, StatusBadge, SummaryGrid } from "@/southernstar/components";

type BrokerShareTotal = {
  key: string;
  ownerLabel: string;
  broker: string;
  value: number;
  positions: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${money(value)}`;
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
}

/** Day-month-year, matching the position book so Capital never mixes two date orders. */
function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
}

function pnlTone(value: number) {
  return value >= 0 ? "positive" as const : "negative" as const;
}

function ownerLabel(account: DashboardData) {
  return account.scope === "smsf" ? "SMSF" : "Personal";
}

function isSharePosition(position: DashboardHolding) {
  return position.symbol !== "CASH" && position.exchange !== "CASH" && sectorForInstrument(position) !== "Cash" && position.broker !== "Physical";
}

function brokerName(value: string) {
  const broker = value.trim();
  if (broker.toLowerCase() === "ibkr") return "IBKR";
  if (broker.toLowerCase() === "directshares") return "Directshares";
  return broker || "Unknown";
}

function brokerShareTotals(accounts: DashboardData[]) {
  const totals = new Map<string, BrokerShareTotal>();
  for (const account of accounts) {
    const label = ownerLabel(account);
    for (const holding of account.holdings) {
      if (!isSharePosition(holding)) continue;
      const broker = brokerName(holding.broker);
      const key = `${account.scope}:${broker}`;
      const current = totals.get(key) ?? { key, ownerLabel: label, broker, value: 0, positions: 0 };
      current.value += holding.marketValueAud;
      current.positions += 1;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || a.ownerLabel.localeCompare(b.ownerLabel) || a.broker.localeCompare(b.broker));
}

function sharePositionValue(account: DashboardData) {
  return account.holdings.filter(isSharePosition).reduce((sum, holding) => sum + holding.marketValueAud, 0);
}

export default function CapitalSummary({ accounts }: { accounts: DashboardData[] }) {
  const brokerTotals = brokerShareTotals(accounts);
  const totalNav = accounts.reduce((sum, account) => sum + account.totalValue, 0);
  const totalShares = brokerTotals.reduce((sum, broker) => sum + broker.value, 0);
  const totalSharePositions = brokerTotals.reduce((sum, broker) => sum + broker.positions, 0);

  return (
    <section className="capitalSummary" aria-label="Capital allocation summary">
      <Card className="capitalSummaryHero">
        <div>
          <p className="eyebrow">Capital</p>
          <h2 className="cardTitle">Legal books and share allocation</h2>
          <p className="cardIntro">Personal and SMSF remain separate legal books. Broker rows show share positions only, excluding cash and physical metal.</p>
        </div>
        <div className="capitalSummaryTotals">
          <div><span>Total NAV</span><strong>{money(totalNav)}</strong></div>
          <div><span>Share allocation</span><strong>{money(totalShares)}</strong><em>{totalSharePositions} positions</em></div>
        </div>
      </Card>

      <div className="capitalAccountGrid">
        {accounts.map((account) => {
          const shares = sharePositionValue(account);
          return (
            <Card className="accountSnapshot" key={account.scope}>
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">{ownerLabel(account)}</p>
                  <h2 className="cardTitle">{money(account.totalValue)}</h2>
                </div>
                <StatusBadge tone={account.scope === "smsf" ? "warning" : "good"}>{account.holdings.length} positions</StatusBadge>
              </div>
              <SummaryGrid
                entries={[
                  ["Share positions", money(shares)],
                  ["Cash", money(account.cashValue)],
                  ["Day P/L", signedMoney(account.dailyMovement), pnlTone(account.dailyMovement)],
                  ["Open P/L", signedMoney(account.totalReturn), pnlTone(account.totalReturn)],
                  ["Return", percent(account.totalReturnPercent)],
                  ["Updated", dateLabel(account.lastUpdated)],
                ]}
              />
            </Card>
          );
        })}
      </div>

      <Card className="capitalBrokerCard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Broker split</p>
            <h2 className="cardTitle">Where shares are held</h2>
          </div>
          <span className="panelCount">{brokerTotals.length} broker books</span>
        </div>
        <div className="capitalBrokerRows">
          {brokerTotals.map((item) => (
            <div className="capitalBrokerRow" key={item.key}>
              <div><strong>{item.broker}</strong><span>{item.ownerLabel} · {item.positions} position{item.positions === 1 ? "" : "s"}</span></div>
              <span><i style={{ width: `${totalShares ? Math.max(3, item.value / totalShares * 100) : 0}%` }} /></span>
              <strong>{money(item.value)}</strong>
            </div>
          ))}
          <div className="capitalBrokerRow isTotal">
            <div><strong>Total share allocation</strong><span>Personal + SMSF share positions</span></div>
            <span><i style={{ width: "100%" }} /></span>
            <strong>{money(totalShares)}</strong>
          </div>
        </div>
      </Card>
    </section>
  );
}
