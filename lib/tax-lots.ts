import {
  defaultParcelSelectionMethod,
  methodForHolding,
  orderParcelsForDisposal,
  parcelSelectionLabels,
  type ParcelSelection,
  type ParcelSelectionMethod,
} from "@/lib/parcel-selection";
import type { DashboardData, DashboardHolding, OwnerType, Scope, StoredTransaction } from "@/lib/storage";

export type OpenTaxLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  asOfDate: string;
  heldDays: number | null;
  discountEligible: boolean;
  discountRate: number;
  quantity: number;
  costAud: number;
  marketValueAud: number;
  unrealisedGainAud: number;
  unrealisedGainPercent: number;
  taxableGainIfSoldAud: number;
  source: "transaction_fifo" | "position_fallback";
  note: string;
};

export type RealisedTaxLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  saleDate: string;
  heldDays: number | null;
  discountEligible: boolean;
  discountRate: number;
  quantity: number;
  proceedsAud: number;
  costAud: number;
  realisedGainAud: number;
  taxableGainAud: number;
  /*
   * Which rule chose this parcel. Recorded per lot rather than per report because the choice is
   * per holding, and because a disposal has to be explainable years later: "why this parcel" is
   * the first question anyone reviewing a gain will ask.
   */
  selectionMethod: ParcelSelectionMethod;
  note: string;
};

export type TaxLotsResponse = {
  scope: Scope;
  asOfDate: string;
  generatedAt: string;
  /** Corporate actions the engine could not apply. Never empty silently: see dataQualityNotes. */
  unappliedActions: UnappliedCorporateAction[];
  /** Trades recorded twice by two exports and merged back to one. */
  duplicates: DuplicateTradeWarning[];
  /** Probable duplicates differing only by a day or two; reported, never merged. */
  near: DuplicateTradeWarning[];
  /** The parcel selection this run was built under, so a report can state it rather than imply it. */
  selection: ParcelSelection;
  summary: {
    openLots: number;
    realisedLots: number;
    openCostAud: number;
    openMarketValueAud: number;
    unrealisedGainAud: number;
    unrealisedDiscountEligibleGainAud: number;
    taxableGainIfSoldAud: number;
    realisedGainAud: number;
    realisedLossAud: number;
    netRealisedAud: number;
    taxableRealisedAud: number;
    fallbackLots: number;
  };
  openLots: OpenTaxLot[];
  realisedLots: RealisedTaxLot[];
};

type WorkingLot = {
  id: string;
  ownerType: OwnerType;
  ownerLabel: string;
  broker: string;
  accountKey: string;
  symbol: string;
  name: string;
  exchange: string;
  acquisitionDate: string | null;
  remainingQuantity: number;
  costPerUnitAud: number;
  source: "transaction_fifo" | "position_fallback";
  note: string;
};

const tolerance = 0.000001;

function ownerLabel(ownerType: OwnerType) {
  return ownerType === "SMSF" ? "SMSF" : "Personal";
}

/**
 * The CGT discount rate for a book in accumulation phase: a third for a complying fund, a half for
 * an individual. A fund in pension phase never reaches this — its gains are exempt outright, and a
 * discount on an exempt gain is meaningless.
 */
export function discountRateForOwner(ownerType: OwnerType) {
  return discountRate(ownerType);
}

/**
 * The one implementation of "what is actually taxed", exported so no second module can re-derive
 * it. The EOFY report used to compute its own and silently reversed the pension-phase exemption.
 */
export function taxableGainForTreatment(gainAud: number, eligible: boolean, rate: number, treatment: TaxTreatment) {
  return taxableGain(gainAud, eligible, rate, treatment);
}

function discountRate(ownerType: OwnerType) {
  return ownerType === "SMSF" ? 1 / 3 : 0.5;
}

export type TaxTreatment = {
  /** True where the book is wholly in pension phase, making capital gains exempt. */
  pensionPhase: boolean;
};

const ACCUMULATION: TaxTreatment = { pensionPhase: false };

function maskAccount(account: string) {
  if (!account) return "";
  return account.length <= 4 ? account : `${account.slice(0, 2)}....${account.slice(-3)}`;
}

function dateDiffDays(start: string | null, end: string) {
  if (!start) return null;
  const startTime = new Date(`${start}T12:00:00Z`).getTime();
  const endTime = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  return Math.floor((endTime - startTime) / 86_400_000);
}

function isDiscountEligible(heldDays: number | null) {
  return heldDays != null && heldDays >= 365;
}

/**
 * What would actually be taxed on a disposal today.
 *
 * A gain in a pension-phase book is exempt current pension income, so the answer is nothing at all
 * — not the gain less a discount. Reporting it as fully taxable, which is what happens without a
 * tax treatment, makes trimming a winner in the fund look expensive when it is free.
 */
function taxableGain(gainAud: number, eligible: boolean, rate: number, treatment: TaxTreatment) {
  if (treatment.pensionPhase) return 0;
  if (gainAud <= 0) return gainAud;
  return eligible ? gainAud * (1 - rate) : gainAud;
}

function audAmount(value: number | null | undefined, fxRateToBase: number | null | undefined) {
  return (value ?? 0) * (fxRateToBase || 1);
}

/**
 * The same identity without the account.
 *
 * A trade file need not name the account it came from: the Directshares All Trades Report is
 * titled with a person, and its holdings export takes the account from a column the trades export
 * does not have. When those two disagree the account-qualified key misses, every lot falls back to
 * cost basis, and the positions read as undated even though their trades are sitting in storage.
 */
function brokerKey(input: { ownerType: string; broker: string; symbol: string; exchange: string }) {
  // Ticker and venue, not the instrument key: the key is not written the same way on both sides.
  // Postgres stores a Directshares position as "ASL:ASX" while an imported trade carries
  // "Directshares:ASL:ASX", so keying on it reproduces the very mismatch this exists to survive.
  return [
    input.ownerType,
    input.broker,
    `${input.symbol}:${input.exchange}`.toUpperCase(),
  ].join("|");
}

function holdingKey(input: Pick<DashboardHolding, "ownerType" | "broker" | "accountKey" | "instrumentKey" | "symbol" | "exchange">) {
  return [
    input.ownerType,
    input.broker,
    input.accountKey,
    input.instrumentKey || `${input.symbol}:${input.exchange}`,
  ].join("|");
}

function transactionKey(transaction: StoredTransaction) {
  return [
    transaction.ownerType,
    transaction.broker,
    transaction.accountKey,
    transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`,
  ].join("|");
}

function isTaxableHolding(holding: DashboardHolding) {
  if (Math.abs(holding.quantity) <= tolerance) return false;
  return holding.assetClass !== "Cash" && holding.symbol.toUpperCase() !== "CASH";
}

function buyCostAud(transaction: StoredTransaction) {
  return Math.abs(audAmount(transaction.cost, transaction.fxRateToBase)) + (transaction.fees ?? 0) + (transaction.taxes ?? 0);
}

function sellProceedsAud(transaction: StoredTransaction) {
  if (transaction.netCash != null) return Math.abs(audAmount(transaction.netCash, transaction.fxRateToBase));
  return Math.max(0, Math.abs(audAmount(transaction.cost, transaction.fxRateToBase)) - (transaction.fees ?? 0) - (transaction.taxes ?? 0));
}

function makeRealisedLot(input: Omit<RealisedTaxLot, "taxableGainAud" | "discountEligible" | "discountRate" | "heldDays" | "ownerLabel">, treatment: TaxTreatment) {
  const heldDays = dateDiffDays(input.acquisitionDate, input.saleDate);
  const discount = discountRate(input.ownerType);
  const eligible = isDiscountEligible(heldDays);
  return {
    ...input,
    ownerLabel: ownerLabel(input.ownerType),
    heldDays,
    discountEligible: eligible,
    discountRate: discount,
    taxableGainAud: taxableGain(input.realisedGainAud, eligible, discount, treatment),
  };
}

/**
 * Rescales a holding's open parcels for a corporate action that changes the share count without
 * being a disposal — a consolidation, a split, a bonus issue.
 *
 * Three things matter and each is easy to get wrong:
 *
 *   - The acquisition date rides with the parcel. None of these is a CGT event, so the twelve-month
 *     clock does not restart. Resetting it would silently strip discount eligibility from long-held
 *     holdings, which is a worse error than the cost-base one and far harder to notice.
 *   - Total cost base is unchanged; only cost per unit moves. The ratio divides into the unit cost
 *     exactly as it multiplies the quantity.
 *   - It is applied per parcel, not to the aggregate, because parcels have different unit costs and
 *     different dates and must stay distinguishable afterwards.
 *
 * The ratio comes from the row's own quantity delta rather than any declared terms, so VAU's
 * 50,000 to 7,693 resolves without the report ever stating "1 for 6.5". Fractions are kept: the
 * book already carries 87.5 BMN and 19.5 CORN, and rounding here would quietly lose value.
 */
function applyCorporateAction(parcels: WorkingLot[], deltaQuantity: number, stated: ActionRatio | null): boolean {
  const pooled = parcels.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  if (pooled <= tolerance) return false;
  /*
   * The stated ratio wins where the export gave one, because a delta only describes the holding
   * the reporting entity could see. PDN's −94,355 is one account's reduction, while the pool also
   * holds 12,661 units bought in another; inferring from the pool reads a 1-for-10 consolidation as
   * 1-for-5. Applying the stated ratio to the whole pool is right either way: every holder of the
   * security was consolidated on the same terms.
   */
  const ratio = stated ? stated.after / stated.before : (pooled + deltaQuantity) / pooled;
  if (!Number.isFinite(ratio) || ratio <= 0) return false;

  for (const parcel of parcels) {
    if (parcel.remainingQuantity <= tolerance) continue;
    parcel.remainingQuantity *= ratio;
    parcel.costPerUnitAud /= ratio;
  }
  return true;
}

type ActionRatio = { before: number; after: number };

/**
 * The before and after quantities an importer recorded for a corporate action, where it knew them.
 *
 * Absent for anything imported before importers carried them, and for an action whose own export
 * could not establish a usable holding — GOLD's split sits on a negative running balance because
 * its purchases predate every export supplied. Both fall back to inferring from the pool.
 */
function statedActionRatio(transaction: StoredTransaction): ActionRatio | null {
  const before = Number(transaction.raw?.actionQuantityBefore);
  const after = Number(transaction.raw?.actionQuantityAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (before <= tolerance || after <= tolerance) return null;
  return { before, after };
}

export type UnappliedCorporateAction = {
  symbol: string;
  tradeDate: string;
  description: string;
  quantity: number | null;
  reason: string;
};

export type DuplicateTradeWarning = {
  symbol: string;
  tradeDate: string;
  type: string;
  quantity: number;
  sources: string[];
  reason: string;
};

/**
 * Economic identity of a trade bar its date, independent of which export carried it or what id it
 * stamped. The date is handled separately because one broker states two of them for a single trade.
 */
function tradeIdentity(transaction: StoredTransaction) {
  return [
    transaction.ownerType,
    transaction.symbol.toUpperCase(),
    transaction.exchange.toUpperCase(),
    transaction.type,
    Math.abs(transaction.quantity ?? 0).toFixed(6),
  ].join("|");
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every date the broker itself gave for this trade.
 *
 * A Directshares contract note carries both: SVM's sale is "as at" 16 June and dated 17 June, and
 * the All Trades Report reports it on the 16th. That is one sale under two of the broker's own
 * conventions, not a guess about nearby dates, so matching on either is safe where matching on
 * proximity would not be.
 */
function tradeDates(transaction: StoredTransaction) {
  const dates = new Set([transaction.tradeDate]);
  const alternate = transaction.raw?.asAtDate;
  if (typeof alternate === "string" && isoDay.test(alternate)) dates.add(alternate);
  return dates;
}

/**
 * Collapses rows an importer numbered as the same fill of the same order.
 *
 * An importer that numbers its fills is stating how many there were, which the source name alone
 * cannot: two records of one sale and two genuine fills both arrive as two rows from "Directshares
 * All Trades Report". BOE's 12,263-unit sale came from two exports of the same history at different
 * price precision, and because its id embeds the price neither import could see the other. Both
 * rows are fill 1, so they are one sale; two real fills would be 1 and 2.
 *
 * Rows from an importer that does not number its fills are left alone — IBKR's arrive with distinct
 * broker ids and distinct cash amounts, and are genuinely separate fills.
 */
function fillsWithinSource(rows: StoredTransaction[]) {
  const byFill = new Map<number, StoredTransaction>();
  const unnumbered: StoredTransaction[] = [];
  for (const row of rows) {
    const index = Number(row.raw?.fillIndex);
    if (!Number.isInteger(index) || index <= 0) {
      unnumbered.push(row);
      continue;
    }
    if (!byFill.has(index)) byFill.set(index, row);
  }
  return [...byFill.values(), ...unnumbered];
}

/** Whether an export stated both of the broker's dates for these rows, which a contract note does. */
function datedBothWays(rows: StoredTransaction[]) {
  return rows.some((row) => tradeDates(row).size > 1) ? 1 : 0;
}

/** Rows within one identity that the broker dated to the same day under either of its conventions. */
function clusterByDate(rows: StoredTransaction[]) {
  const clusters: { dates: Set<string>; rows: StoredTransaction[] }[] = [];
  for (const row of rows) {
    const dates = tradeDates(row);
    const existing = clusters.find((cluster) => [...dates].some((date) => cluster.dates.has(date)));
    if (!existing) {
      clusters.push({ dates, rows: [row] });
      continue;
    }
    existing.rows.push(row);
    for (const date of dates) existing.dates.add(date);
  }
  return clusters;
}

/**
 * Removes trades recorded twice because two exports both carry them.
 *
 * Brokers stamp their own id on each export, so de-duplication by external id cannot tell that
 * IBKR's Activity Flex and Trade Confirmation Flex queries describe the same fill, nor that a
 * Directshares sale appears in both the All Trades Report and a contract note. Thirteen IBKR
 * holdings sat at exactly twice their real quantity, and four Directshares sales became phantom
 * disposals with no parcels left to match.
 *
 * Only an exact economic match is merged: same owner, security, side, quantity, and a date the
 * broker gave for both. A pair the broker never dated alike — a contract note dated to the trade
 * against an export dated to settlement — is reported rather than merged, because at that point it
 * is indistinguishable from two genuine trades and guessing would destroy a real disposal.
 *
 * Within one identity the count that survives is the *most* any single export reported, not one.
 * A large order fills in pieces and every export carrying it carries all of them: XLE's two 300
 * unit fills arrive as 300, 300 from each of two IBKR queries, and collapsing that to a single row
 * would delete 300 real units as surely as keeping all four would invent 300.
 */
function dedupeTrades(transactions: StoredTransaction[]) {
  const groups = new Map<string, StoredTransaction[]>();
  for (const transaction of transactions) {
    const identity = tradeIdentity(transaction);
    groups.set(identity, [...(groups.get(identity) ?? []), transaction]);
  }

  const duplicates: DuplicateTradeWarning[] = [];
  const dropped = new Set<StoredTransaction>();

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    for (const cluster of clusterByDate(rows)) {
      if (cluster.rows.length < 2) continue;
      const perSource = new Map<string, StoredTransaction[]>();
      for (const row of cluster.rows) perSource.set(row.source, [...(perSource.get(row.source) ?? []), row]);

      // An export's own fill numbering collapses its re-reports of a single fill. This is the only
      // duplicate visible inside one source, and the only one the source name cannot rule out.
      let collapsed = 0;
      for (const [source, rowsForSource] of perSource) {
        const fills = fillsWithinSource(rowsForSource);
        if (fills.length === rowsForSource.length) continue;
        for (const row of rowsForSource) if (!fills.includes(row)) dropped.add(row);
        collapsed += rowsForSource.length - fills.length;
        perSource.set(source, fills);
      }

      // Repeats inside a single export are otherwise genuine fills of one order, as CORN's five were.
      if (perSource.size < 2) {
        if (collapsed) {
          const [kept] = [...perSource.values()][0];
          duplicates.push({
            symbol: kept.symbol,
            tradeDate: kept.tradeDate,
            type: kept.type,
            quantity: Math.abs(kept.quantity ?? 0),
            sources: [kept.source],
            reason: `${cluster.rows.length} records of ${cluster.rows.length - collapsed}`
              + ` trade${cluster.rows.length - collapsed === 1 ? "" : "s"}, which that export numbered`
              + " as the same fill — one trade exported twice, not two fills",
          });
        }
        continue;
      }

      /*
       * The export that saw the most fills saw them all; the others are re-reporting the same ones.
       *
       * A tie goes to the export that stated both of the broker's dates, which is the contract
       * note: it is the primary document, and the date of the record that survives is the date the
       * disposal is reported on. Left to input order a sale dated 30 June on one export and 1 July
       * on the other would fall into whichever financial year the rows happened to arrive in.
       */
      let dominant: StoredTransaction[] = [];
      for (const rowsForSource of [...perSource.values()].sort((a, b) =>
        datedBothWays(b) - datedBothWays(a) || a[0].externalId.localeCompare(b[0].externalId))) {
        if (rowsForSource.length > dominant.length) dominant = rowsForSource;
      }
      for (const row of cluster.rows) {
        if (!dominant.includes(row)) dropped.add(row);
      }

      const first = dominant[0];
      const dates = [...cluster.dates].sort();
      duplicates.push({
        symbol: first.symbol,
        tradeDate: first.tradeDate,
        type: first.type,
        quantity: Math.abs(first.quantity ?? 0),
        sources: [...perSource.keys()],
        reason: `${cluster.rows.length} records of ${dominant.length} trade${dominant.length === 1 ? "" : "s"}`
          + ` with the same security, side and quantity across ${perSource.size} exports`
          + (dates.length > 1 ? `, dated ${dates.join(" and ")} by the broker's two conventions` : ""),
      });
    }
  }

  const kept = transactions.filter((transaction) => !dropped.has(transaction));

  // Near misses: identical but for the date, within a few days. Flagged, never merged.
  const near: DuplicateTradeWarning[] = [];
  const loose = new Map<string, StoredTransaction[]>();
  for (const transaction of kept) {
    const key = [transaction.ownerType, transaction.symbol.toUpperCase(), transaction.type, Math.abs(transaction.quantity ?? 0).toFixed(6)].join("|");
    loose.set(key, [...(loose.get(key) ?? []), transaction]);
  }
  for (const rows of loose.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = dateDiffDays(sorted[index - 1].tradeDate, sorted[index].tradeDate);
      if (gap == null || gap > 4 || gap === 0) continue;
      if (sorted[index - 1].source === sorted[index].source) continue;
      near.push({
        symbol: sorted[index].symbol,
        tradeDate: `${sorted[index - 1].tradeDate} / ${sorted[index].tradeDate}`,
        type: sorted[index].type,
        quantity: Math.abs(sorted[index].quantity ?? 0),
        sources: [sorted[index - 1].source, sorted[index].source],
        reason: `same security, side and quantity ${gap} day${gap === 1 ? "" : "s"} apart in two exports; possibly one trade dated to trade and to settlement`,
      });
    }
  }

  return { kept, duplicates, near };
}

function buildWorkingLots(transactions: StoredTransaction[], treatment: TaxTreatment, selection: ParcelSelection) {
  const lots = new Map<string, WorkingLot[]>();
  // Second index on the same lot objects, so a fallback lookup shares their consumed quantities.
  const byBroker = new Map<string, WorkingLot[]>();
  const realised: RealisedTaxLot[] = [];
  const unappliedActions: UnappliedCorporateAction[] = [];
  const { kept, duplicates, near } = dedupeTrades(
    transactions.filter((transaction) => transaction.type === "BUY" || transaction.type === "SELL" || transaction.type === "CORPORATE_ACTION"),
  );
  const sorted = [...kept]
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.externalId.localeCompare(b.externalId));

  for (const transaction of sorted) {
    const key = transactionKey(transaction);

    if (transaction.type === "CORPORATE_ACTION") {
      // Anything that cannot be applied is reported rather than skipped. Silence is how the VAU
      // consolidation survived long enough to put $16,948 into a report being used for decisions.
      const delta = transaction.quantity ?? 0;
      const stated = statedActionRatio(transaction);
      const applied = (delta !== 0 || stated != null)
        && applyCorporateAction(byBroker.get(brokerKey(transaction)) ?? [], delta, stated);
      if (!applied) {
        unappliedActions.push({
          symbol: transaction.symbol,
          tradeDate: transaction.tradeDate,
          description: transaction.description || "Corporate action",
          quantity: transaction.quantity ?? null,
          reason: !delta && !stated
            ? "no quantity change recorded"
            : (byBroker.get(brokerKey(transaction)) ?? []).length
              ? "no open parcels remained to rescale"
              : "no acquisition history for this holding",
        });
      }
      continue;
    }
    const quantity = Math.abs(transaction.quantity ?? 0);
    if (quantity <= tolerance) continue;
    /*
     * A sell consumes from the broker-level pool, not the account-qualified one. The account on a
     * transaction is an artefact of which export carried it — the same Directshares holding arrives
     * as "DIRECTSHARES" from the All Trades Report and as "4317403" from the contract notes — so
     * keying parcels by account stops a sell ever reaching buys imported from the other file.
     *
     * BOE is what that costs: the All Trades file alone leaves 1,637 units when an 8,000 sell
     * arrives, so 6,363 units disposed against buys sitting in storage under another account key,
     * and a $10,668 loss went unreported. CGT is assessed per taxpayer, not per broker account, so
     * pooling here is both the fix and the correct treatment.
     */
    const lotRows = byBroker.get(brokerKey(transaction)) ?? [];

    if (transaction.type === "BUY") {
      const costAud = buyCostAud(transaction);
      lotRows.push({
        id: transaction.id,
        ownerType: transaction.ownerType,
        ownerLabel: ownerLabel(transaction.ownerType),
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: transaction.tradeDate,
        remainingQuantity: quantity,
        costPerUnitAud: quantity ? costAud / quantity : 0,
        source: "transaction_fifo",
        note: "Matched from imported BUY transaction.",
      });
      byBroker.set(brokerKey(transaction), lotRows);
      // The account-qualified index points at the same parcel objects, so a holding lookup by exact
      // key still works and shares whatever the pool has consumed.
      const accountRows = lots.get(key) ?? [];
      accountRows.push(lotRows[lotRows.length - 1]);
      lots.set(key, accountRows);
      continue;
    }

    let remainingSaleQuantity = quantity;
    const proceedsAud = sellProceedsAud(transaction);
    const proceedsPerUnitAud = quantity ? proceedsAud / quantity : 0;

    /*
     * The parcels are ordered per disposal, not once per holding, because what a parcel is worth
     * selling changes with the sale: the twelve-month test is measured to this sale's date, and the
     * gain depends on this sale's proceeds. A method chosen for the holding is applied to each of
     * its disposals in turn.
     */
    const method = methodForHolding(selection, transaction);
    const ordered = orderParcelsForDisposal(lotRows, method, (lot) => {
      const heldDays = dateDiffDays(lot.acquisitionDate, transaction.tradeDate);
      const gainPerUnitAud = proceedsPerUnitAud - lot.costPerUnitAud;
      return taxableGain(gainPerUnitAud, isDiscountEligible(heldDays), discountRate(transaction.ownerType), treatment);
    });

    for (const lot of ordered) {
      if (remainingSaleQuantity <= tolerance) break;
      if (lot.remainingQuantity <= tolerance) continue;
      const matchedQuantity = Math.min(lot.remainingQuantity, remainingSaleQuantity);
      const costAud = lot.costPerUnitAud * matchedQuantity;
      const matchedProceedsAud = proceedsPerUnitAud * matchedQuantity;
      realised.push(makeRealisedLot({
        id: `${transaction.id}:${lot.id}:${matchedQuantity}`,
        ownerType: transaction.ownerType,
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || lot.name || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: lot.acquisitionDate,
        saleDate: transaction.tradeDate,
        quantity: matchedQuantity,
        proceedsAud: matchedProceedsAud,
        costAud,
        realisedGainAud: matchedProceedsAud - costAud,
        selectionMethod: method,
        note: `${parcelSelectionLabels[method]} match from imported transactions.`,
      }, treatment));
      lot.remainingQuantity -= matchedQuantity;
      remainingSaleQuantity -= matchedQuantity;
    }

    if (remainingSaleQuantity > tolerance) {
      const unmatchedProceedsAud = proceedsPerUnitAud * remainingSaleQuantity;
      const brokerRealisedAud = audAmount(transaction.realisedPnl, transaction.fxRateToBase);
      const estimatedGainAud = brokerRealisedAud || 0;
      realised.push(makeRealisedLot({
        id: `${transaction.id}:unmatched`,
        ownerType: transaction.ownerType,
        broker: transaction.broker,
        accountKey: maskAccount(transaction.accountKey),
        symbol: transaction.symbol,
        name: transaction.description || transaction.symbol,
        exchange: transaction.exchange,
        acquisitionDate: null,
        saleDate: transaction.tradeDate,
        quantity: remainingSaleQuantity,
        proceedsAud: unmatchedProceedsAud,
        costAud: Math.max(0, unmatchedProceedsAud - estimatedGainAud),
        realisedGainAud: estimatedGainAud,
        // No parcel was chosen, so no method chose it; the holding's own method is still what would
        // have applied, which is what makes the row comparable with the matched ones beside it.
        selectionMethod: method,
        note: transaction.realisedPnl != null ? "Acquisition lot missing; using broker realised P/L." : "Acquisition lot missing; realised gain cannot be reconstructed.",
      }, treatment));
    }
  }

  return { lots, byBroker, realised, unappliedActions, duplicates, near };
}

function openLotsForHolding(holding: DashboardHolding, lots: WorkingLot[], asOfDate: string, treatment: TaxTreatment): OpenTaxLot[] {
  const currentQuantity = Math.abs(holding.quantity);
  if (currentQuantity <= tolerance) return [];
  const positiveLots = lots.filter((lot) => lot.remainingQuantity > tolerance);
  const lotQuantity = positiveLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const scale = lotQuantity > currentQuantity && lotQuantity > tolerance ? currentQuantity / lotQuantity : 1;
  const output: OpenTaxLot[] = [];
  let representedQuantity = 0;
  let representedCostAud = 0;

  for (const lot of positiveLots) {
    const quantity = lot.remainingQuantity * scale;
    if (quantity <= tolerance) continue;
    representedQuantity += quantity;
    const costAud = lot.costPerUnitAud * quantity;
    representedCostAud += costAud;
    const marketValueAud = holding.marketValueAud * (quantity / currentQuantity);
    const gainAud = marketValueAud - costAud;
    const heldDays = dateDiffDays(lot.acquisitionDate, asOfDate);
    const eligible = isDiscountEligible(heldDays);
    const rate = discountRate(holding.ownerType);
    output.push({
      id: `${holding.id}:${lot.id}`,
      ownerType: holding.ownerType,
      ownerLabel: ownerLabel(holding.ownerType),
      broker: holding.broker,
      accountKey: maskAccount(holding.accountKey),
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      acquisitionDate: lot.acquisitionDate,
      asOfDate,
      heldDays,
      discountEligible: eligible,
      discountRate: rate,
      quantity,
      costAud,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: costAud ? (gainAud / costAud) * 100 : 0,
      taxableGainIfSoldAud: taxableGain(gainAud, eligible, rate, treatment),
      source: lot.source,
      note: scale < 1 ? "Imported transaction lots scaled to current position quantity." : lot.note,
    });
  }

  const missingQuantity = Math.max(0, currentQuantity - representedQuantity);
  if (missingQuantity > tolerance) {
    const fallbackCostAud = Math.max(0, holding.costAud - representedCostAud) || holding.averageCostAud * missingQuantity;
    const marketValueAud = holding.marketValueAud * (missingQuantity / currentQuantity);
    const gainAud = marketValueAud - fallbackCostAud;
    const rate = discountRate(holding.ownerType);
    /*
     * A fallback parcel normally has no date, because it exists precisely where trade history is
     * missing. Physical metal is the exception: it is bought on an invoice rather than a contract
     * note, so its purchase date sits on the asset record and reaches here on the position. Without
     * this the platinum parcel defaulted to no discount, overstating its taxable gain by half.
     */
    const fallbackAcquisitionDate = holding.acquisitionDate || null;
    const fallbackHeldDays = dateDiffDays(fallbackAcquisitionDate, asOfDate);
    const fallbackEligible = isDiscountEligible(fallbackHeldDays);
    output.push({
      id: `${holding.id}:fallback`,
      ownerType: holding.ownerType,
      ownerLabel: ownerLabel(holding.ownerType),
      broker: holding.broker,
      accountKey: maskAccount(holding.accountKey),
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      acquisitionDate: fallbackAcquisitionDate,
      asOfDate,
      heldDays: fallbackHeldDays,
      discountEligible: fallbackEligible,
      discountRate: rate,
      quantity: missingQuantity,
      costAud: fallbackCostAud,
      marketValueAud,
      unrealisedGainAud: gainAud,
      unrealisedGainPercent: fallbackCostAud ? (gainAud / fallbackCostAud) * 100 : 0,
      taxableGainIfSoldAud: taxableGain(gainAud, fallbackEligible, rate, treatment),
      source: "position_fallback",
      note: holding.acquisitionDate
        ? "No trade history; dated from the asset record and valued at current position cost basis."
        : "Trade history incomplete; using current position cost basis.",
    });
  }

  return output;
}

export function buildTaxLots(
  data: DashboardData,
  transactions: StoredTransaction[],
  generatedAt = new Date(),
  treatment: TaxTreatment = ACCUMULATION,
  selection: ParcelSelection = { method: defaultParcelSelectionMethod },
): TaxLotsResponse {
  const asOfDate = (data.lastUpdated ?? generatedAt.toISOString()).slice(0, 10);
  const { lots, byBroker, realised, unappliedActions, duplicates, near } = buildWorkingLots(transactions, treatment, selection);
  const openLots = data.holdings
    .filter(isTaxableHolding)
    .flatMap((holding) => openLotsForHolding(
      holding,
      lots.get(holdingKey(holding)) ?? byBroker.get(brokerKey(holding)) ?? [],
      asOfDate,
      treatment,
    ))
    .sort((a, b) => b.unrealisedGainAud - a.unrealisedGainAud);
  const realisedLots = realised.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  const realisedGainAud = realisedLots.reduce((sum, lot) => lot.realisedGainAud > 0 ? sum + lot.realisedGainAud : sum, 0);
  const realisedLossAud = realisedLots.reduce((sum, lot) => lot.realisedGainAud < 0 ? sum + Math.abs(lot.realisedGainAud) : sum, 0);

  return {
    scope: data.scope,
    unappliedActions,
    duplicates,
    near,
    selection,
    asOfDate,
    generatedAt: generatedAt.toISOString(),
    summary: {
      openLots: openLots.length,
      realisedLots: realisedLots.length,
      openCostAud: openLots.reduce((sum, lot) => sum + lot.costAud, 0),
      openMarketValueAud: openLots.reduce((sum, lot) => sum + lot.marketValueAud, 0),
      unrealisedGainAud: openLots.reduce((sum, lot) => sum + lot.unrealisedGainAud, 0),
      unrealisedDiscountEligibleGainAud: openLots.reduce((sum, lot) => lot.discountEligible && lot.unrealisedGainAud > 0 ? sum + lot.unrealisedGainAud : sum, 0),
      taxableGainIfSoldAud: openLots.reduce((sum, lot) => sum + lot.taxableGainIfSoldAud, 0),
      realisedGainAud,
      realisedLossAud,
      netRealisedAud: realisedGainAud - realisedLossAud,
      taxableRealisedAud: realisedLots.reduce((sum, lot) => sum + lot.taxableGainAud, 0),
      fallbackLots: openLots.filter((lot) => lot.source === "position_fallback").length,
    },
    openLots,
    realisedLots,
  };
}
