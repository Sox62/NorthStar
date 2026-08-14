import { buildCapitalPolicySummary } from "@/lib/capital-policy";
import type { DashboardData, DashboardHolding, StoredOpenOrder, SyncRun, ValuationFreshness } from "@/lib/storage";
import { Card, StatusBadge } from "@/northstar/components";
import { sectorForInstrument } from "@/northstar/lib/sector-map";

type MandateAccount = DashboardData & { scope: "personal" | "smsf" };

type BrokerBook = {
  broker: string;
  accountKey: string;
  positions: number;
  value: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";
}

function ownerLabel(account: MandateAccount) {
  return account.scope === "smsf" ? "SMSF" : "Personal";
}

function mandateText(account: MandateAccount) {
  return account.scope === "smsf"
    ? "Separate SMSF legal entity. Keep broker feeds, cash, reports and tax records isolated from Personal."
    : "Personal legal book. Directshares and Personal IBKR feeds can coexist, but must remain separate from SMSF.";
}

function brokerName(value: string) {
  const broker = value.trim();
  if (broker.toLowerCase() === "ibkr") return "IBKR";
  if (broker.toLowerCase() === "directshares") return "Directshares";
  return broker || "Unknown";
}

function isSharePosition(position: DashboardHolding) {
  return position.symbol !== "CASH" && position.exchange !== "CASH" && sectorForInstrument(position) !== "Cash" && position.broker !== "Physical";
}

function brokerBooks(account: MandateAccount) {
  const books = new Map<string, BrokerBook>();
  for (const holding of account.holdings) {
    if (!isSharePosition(holding)) continue;
    const broker = brokerName(holding.broker);
    const accountKey = holding.accountKey || "Unkeyed";
    const key = `${broker}:${accountKey}`;
    const current = books.get(key) ?? { broker, accountKey, positions: 0, value: 0 };
    current.positions += 1;
    current.value += holding.marketValueAud;
    books.set(key, current);
  }
  return [...books.values()].sort((a, b) => b.value - a.value || a.broker.localeCompare(b.broker));
}

function latestRun(syncRuns: SyncRun[], account: MandateAccount, source: string) {
  return syncRuns.find((run) => run.source.toLowerCase().includes(source) && (!run.ownerType || run.ownerType === account.holdings[0]?.ownerType || run.ownerType === (account.scope === "smsf" ? "SMSF" : "PERSONAL"))) ?? null;
}

function freshnessFor(sourceRows: ValuationFreshness[], source: string) {
  return sourceRows.find((item) => item.source.toLowerCase().includes(source)) ?? null;
}

function statusTone(status?: string | null) {
  return status === "success" || status === "fresh" ? "good" : "warning";
}

function sourceStatus(account: MandateAccount, source: string) {
  const freshness = freshnessFor(account.freshness, source);
  const sync = latestRun(account.syncRuns, account, source);
  const label = freshness?.status ?? sync?.status ?? "not recorded";
  const detail = freshness?.detail ?? sync?.message ?? sync?.error ?? "No recent run recorded.";
  const asOf = freshness?.asOf ?? sync?.finishedAt ?? null;
  return { label, detail, asOf };
}

export default function AccountsMandates({ accounts, openOrders }: { accounts: MandateAccount[]; openOrders: StoredOpenOrder[] }) {
  return (
    <section className="mandatesGrid" aria-label="Accounts and mandates">
      {accounts.map((account) => {
        const books = brokerBooks(account);
        const ibkr = sourceStatus(account, "ibkr");
        const directshares = sourceStatus(account, "directshares");
        const market = sourceStatus(account, "market");
        const policy = buildCapitalPolicySummary(account, openOrders);
        const foreignOrderNote = policy.foreignOpenBuyCount
          ? `${policy.foreignOpenBuyCount} foreign order${policy.foreignOpenBuyCount === 1 ? "" : "s"} flagged separately pending explicit FX`
          : "AUD-denominated open buys only";
        return (
          <Card className="mandateCard" key={account.scope}>
            <div className="mandateHeader">
              <div>
                <p className="eyebrow">Legal book</p>
                <h2 className="cardTitle">{ownerLabel(account)}</h2>
                <p className="cardIntro">{mandateText(account)}</p>
              </div>
              <StatusBadge tone={account.scope === "smsf" ? "warning" : "good"}>{money(account.totalValue)}</StatusBadge>
            </div>

            <dl className="mandateStats">
              <div><dt>NAV</dt><dd>{money(account.totalValue)}</dd></div>
              <div><dt>Share positions</dt><dd>{account.holdings.filter(isSharePosition).length}</dd></div>
              <div><dt>Cash</dt><dd>{money(account.cashValue)}</dd></div>
              <div><dt>Updated</dt><dd>{dateLabel(account.lastUpdated)}</dd></div>
            </dl>

            <div className="mandateSection">
              <h3>Capital policy</h3>
              <div className="mandateSource">
                <div>
                  <strong>{policy.role}</strong>
                  <span>{policy.mandate}</span>
                </div>
                <em className={policy.status === "deployable" ? "is-good" : "is-warning"}>{policy.status === "deployable" ? "deployable" : "floor active"}</em>
              </div>
              <div className="mandateRow">
                <span>Liquidity floor<em>{policy.protectedCapitalNote}</em></span>
                <strong>{money(policy.liquidityFloorAud)}</strong>
              </div>
              <div className="mandateRow">
                <span>Open buy commitments<em>{foreignOrderNote}</em></span>
                <strong>{money(policy.openBuyCommitmentAud)}</strong>
              </div>
              <div className="mandateRow">
                <span>Deployable cash<em>{policy.deploymentPriority}</em></span>
                <strong>{money(policy.deployableCashAud)}</strong>
              </div>
            </div>

            <div className="mandateSection">
              <h3>Broker books</h3>
              {books.length ? books.map((book) => (
                <div className="mandateRow" key={`${book.broker}:${book.accountKey}`}>
                  <span>{book.broker}<em>{book.accountKey}</em></span>
                  <strong>{money(book.value)}<em>{book.positions} position{book.positions === 1 ? "" : "s"}</em></strong>
                </div>
              )) : <p className="small">No share broker books recorded.</p>}
            </div>

            <div className="mandateSection">
              <h3>Feed mandate</h3>
              {[{ name: "IBKR", data: ibkr }, { name: "Directshares", data: directshares }, { name: "Market data", data: market }].map((source) => (
                <div className="mandateSource" key={source.name}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.data.detail}</span>
                  </div>
                  <em className={`is-${statusTone(source.data.label)}`}>{source.data.label} · {dateLabel(source.data.asOf)}</em>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </section>
  );
}
