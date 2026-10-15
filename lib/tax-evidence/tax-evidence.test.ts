import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseIbkrFlexXml } from "@/lib/integrations/ibkr";
import { parseBankEvidenceCsv, evidenceDate } from "./bank-csv";
import { buildTaxEvidenceReport, conversionEvidence } from "./report";
import { evidenceCsv, evidenceZip } from "./export";
import { evidenceDocument, sourceHash } from "./sources";
import { validateTransferReview, encodeReviewNote, decodeReviewNote } from "./transfers";
import { parseWestpacActivityText } from "./bank-pdf";
import { externalFxImport, readExternalFx } from "./external-fx";
import type { LocalStore, StoredTransaction } from "@/lib/storage/types";

// Seed the file before importing the adapter: a missing path otherwise reads the real legacy store.
const dataFile = join(mkdtempSync(join(tmpdir(), "ss-tax-evidence-")), "data.json");
process.env.NORTH_STAR_DATA_FILE = dataFile;
delete process.env.DATABASE_URL;
const empty: LocalStore = { version: 7, transactions: [], positions: [], openOrders: [], riskPlans: [], riskSnapshots: [], cashAccounts: [], manualAssets: [], platinumPrices: [], dailyPrices: [], fxRates: [], snapshots: [], syncRuns: [], allocationTargets: [], sectorOverrides: [], minerFundamentals: [], fundamentalResearchDrafts: [], structuralLevels: [], compositeIndexResults: [], imports: [] };
writeFileSync(dataFile, JSON.stringify(empty));
const at = new Date("2026-10-15T01:00:00Z");
const xml = `<FlexQueryResponse type="AF"><FlexStatements><FlexStatement accountId="SYNTHETIC" fromDate="20260701" toDate="20270630" timeZone="America/New_York">
<CashTransactions><CashTransaction transactionID="deposit" dateTime="20261001;090000" type="Deposits/Withdrawals" currency="USD" amount="1000" /></CashTransactions>
<Trades>
<Trade transactionID="fx1" assetCategory="CASH" symbol="USD.AUD" tradeDate="20261002" buySell="SELL" quantity="-200" tradePrice="1.5" proceeds="300" netCash="299" currency="AUD" ibCommission="-1" ibCommissionCurrency="AUD"/>
<Trade transactionID="fx2" assetCategory="CASH" symbol="USD.AUD" tradeDate="20261003" buySell="SELL" quantity="-200" tradePrice="1.5" proceeds="300" netCash="299" currency="AUD" ibCommission="-1" ibCommissionCurrency="AUD"/>
</Trades>
<CashReport>
<CashReportCurrency currency="USD" levelOfDetail="Currency" startingCash="0" endingCash="600" fxRateToBase="1.5"/>
<CashReportCurrency currency="AUD" levelOfDetail="Currency" startingCash="0" endingCash="598"/>
</CashReport></FlexStatement></FlexStatements></FlexQueryResponse>`;

function bank(system: "Westpac" | "Macquarie", value: number, reference: string, owner = "PERSONAL") {
  const input = parseBankEvidenceCsv(Buffer.from(`Date,Description,Amount,TransactionID\n01/10/2026,Transfer,${value},${reference}\n`), {
    system, accountKey: `${system}-${owner}`, currency: "USD", filename: "statement.csv", startDate: "2026-07-01", endDate: "2027-06-30",
  });
  return input;
}

const bankPdfText = `United States Dollars
Currency Account
Available
AUD 0.00
Transactions
Date Description Debit Credit
07 Aug 2026 WITHDRAWAL ONLINE 3003 INTL JPMORGAN C -$1190.00
06 Aug 2026 OVERSEAS TELEGRAPHIC TRANSFER REFERENCE 3001 - FEE -$10.00
06 Aug 2026 WITHDRAWAL ONLINE 3002 INTL TEST FX -$1200.00
05 Aug 2026 PROCEEDS OVERSEAS TELEGRAPHIC TRANSFER REFERENCE 3001 SYNTHETIC PAYER $2400.00
Things you should know
Processed transactions only.
Account activity
Copyright 2026 Westpac Banking Corporation`;
function syntheticBankPdf() {
  const stream = `BT\n/F1 10 Tf\n40 760 Td\n12 TL\n${bankPdfText.split("\n").map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj T*`).join("\n")}\nET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(data)); data += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const start = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(data);
}

function unzip(buffer: Buffer) {
  const result = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    result.set(name, buffer.subarray(start, start + size)); offset = start + size;
  }
  return result;
}

test("cash-only Flex activity is retained without a security trade, with its original XML", () => {
  const cashOnly = xml.replace(/<Trades>[\s\S]*?<\/Trades>/, "").replace(/<CashReport>[\s\S]*?<\/CashReport>/, "");
  const report = parseIbkrFlexXml(cashOnly);
  assert.equal(report.transactions.length, 1);
  assert.equal(report.transactions[0].type, "CASH_ACTIVITY");
  assert.equal(report.transactions[0].netCash, 1000);
  assert.equal(Buffer.from(report.sourceDocuments![0].contentBase64, "base64").toString(), cashOnly);
  assert.equal(report.transactions[0].raw?._originalDate, "20261001;090000");
});

test("Flex completeness distinguishes omitted sections, empty sections and supplemental trade confirmations", () => {
  const missingSections = [
    ["Trades", "missing_trades_section"], ["CashTransactions", "missing_cash_section"], ["CashReport", "missing_cash_report_section"],
  ];
  for (const [section, expectedCode] of missingSections) {
    const partialXml = xml.replace(new RegExp(`<${section}>[\\s\\S]*?</${section}>`), "");
    const input = parseIbkrFlexXml(partialXml);
    const report = buildTaxEvidenceReport("PERSONAL", [], input.sourceDocuments!.map((source) => evidenceDocument(source, "PERSONAL")), [], 2027, at);
    assert.ok(report.exceptions.some((row) => row.code === expectedCode), section);
  }
  const emptyXml = xml.replace(/<Trades>[\s\S]*?<\/Trades>/, "<Trades/>").replace(/<CashTransactions>[\s\S]*?<\/CashTransactions>/, "<CashTransactions/>");
  const emptyReport = parseIbkrFlexXml(emptyXml);
  const returnedEmpty = buildTaxEvidenceReport("PERSONAL", [], emptyReport.sourceDocuments!.map((source) => evidenceDocument(source, "PERSONAL")), [], 2027, at);
  assert.ok(!returnedEmpty.exceptions.some((row) => missingSections.some(([, code]) => row.code === code)));
  const confirmationXml = `<FlexQueryResponse type="TCF"><FlexStatements><FlexStatement accountId="SYNTHETIC" fromDate="20260701" toDate="20270630"><TradeConfirms>
    <TradeConfirm transactionID="TC1" symbol="SYNTH" tradeDate="20261001" buySell="BUY" currency="AUD" quantity="1" tradePrice="1"/>
    </TradeConfirms></FlexStatement></FlexStatements></FlexQueryResponse>`;
  const confirmation = parseIbkrFlexXml(confirmationXml, { allowTradeConfirmOnly: true });
  const supplemental = buildTaxEvidenceReport("PERSONAL", [], confirmation.sourceDocuments!.map((source) => evidenceDocument(source, "PERSONAL")), [], 2027, at);
  assert.ok(!supplemental.exceptions.some((row) => missingSections.some(([, code]) => row.code === code)));
});

test("FX direction follows signed base quantity and source execution proceeds", () => {
  const rows = parseIbkrFlexXml(xml).transactions;
  const fx = conversionEvidence({ ...rows[0], id: "x", ownerType: "PERSONAL", broker: "IBKR", accountKey: "SYNTHETIC" });
  assert.ok(fx);
  assert.equal(fx.fromCurrency, "USD"); assert.equal(fx.fromAmount, 200);
  assert.equal(fx.toCurrency, "AUD"); assert.equal(fx.toAmount, 300); assert.equal(fx.rate, 1.5);
  assert.equal(fx.feeCurrency, "AUD"); assert.equal(fx.fee, 1);
  const reverse = conversionEvidence({ ...rows[0], quantity: 300, price: 2 / 3, symbol: "AUD.USD", raw: { symbol: "AUD.USD", proceeds: -200 }, id: "y", ownerType: "PERSONAL", broker: "IBKR", accountKey: "SYNTHETIC" });
  assert.equal(reverse?.fromCurrency, "USD"); assert.equal(reverse?.toAmount, 300);
});

test("partial conversions reconcile both currencies and residual USD; exact reimport adds no rows", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  const first = await storage.importIbkr(parseIbkrFlexXml(xml), "PERSONAL");
  const second = await storage.importIbkr(parseIbkrFlexXml(xml), "PERSONAL");
  assert.equal(first.imported, 3); assert.equal(second.imported, 0); assert.equal(second.duplicates, 3);
  assert.equal((await storage.listEvidenceSources("PERSONAL")).length, 1);
  const transactions = await storage.listTransactions("PERSONAL");
  const sources = await storage.listEvidenceSources("PERSONAL");
  const report = buildTaxEvidenceReport("PERSONAL", transactions, sources, [], 2027, at);
  assert.equal(report.conversions.length, 2);
  assert.equal(report.balances.find((row) => row.currency === "USD")?.closing, 600);
  assert.equal(report.balances.find((row) => row.currency === "AUD")?.closing, 598);
  assert.ok(report.balances.every((row) => row.variance === 0));
  assert.equal(report.currencyTotals.find((row) => row.currency === "AUD")?.fees, 2);
  assert.equal(report.exceptions.filter((row) => row.code === "missing_source_file").length, 0);
  assert.equal((await storage.dashboard("personal")).holdings.filter((holding) => holding.assetClass !== "Cash").length, 0);
});

test("direct Flex API evidence refresh retains source responses without replacing valuations or orders", async (context) => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const { readStore } = await import("@/lib/storage/local-store");
  const storage = new LocalStorageAdapter();
  const current = parseIbkrFlexXml(xml);
  current.transactions = []; current.sourceDocuments = [];
  current.openPositions = [{ externalAccountId: "SYNTHETIC", instrumentKey: "SYNTH", symbol: "SYNTH", description: "Synthetic security", exchange: "ASX", currency: "AUD",
    quantity: 20, lastPrice: 30, fxRateToBase: 1, averageCostAud: 20, costAud: 400, marketValueAud: 600, pnlAud: 200, pnlPercent: 50, asOfDate: "2027-07-01" }];
  current.openOrders = [{ externalAccountId: "SYNTHETIC", orderId: "current-order", symbol: "SYNTH", description: "Synthetic order", exchange: "ASX", currency: "AUD",
    side: "BUY", status: "Submitted", orderType: "LMT", timeInForce: "GTC", totalQuantity: 10, filledQuantity: 0, remainingQuantity: 10,
    limitPrice: 25, stopPrice: null, averagePrice: null, createdAt: null, updatedAt: null }];
  current.navSnapshots = [{ externalAccountId: "SYNTHETIC", date: "2027-07-01", stockValueAud: 600, cashValueAud: 1498, totalValueAud: 2098 }];
  const regular = await storage.importIbkr(current, "PERSONAL");
  assert.equal(regular.positions, 1); assert.equal(regular.openOrders, 1);
  const before = await readStore();
  assert.ok(before.cashAccounts.length); assert.ok(before.snapshots.length);
  const settings = { IBKR_PERSONAL_FLEX_TOKEN: "synthetic-private-token", IBKR_PERSONAL_FLEX_QUERY_ID: "synthetic-query", IBKR_PERSONAL_TRADE_CONFIRM_FLEX_QUERY_ID: "" };
  const previous = new Map(Object.keys(settings).map((key) => [key, process.env[key]]));
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, "ndcdyn.interactivebrokers.com");
    assert.equal(url.searchParams.get("t"), settings.IBKR_PERSONAL_FLEX_TOKEN);
    requests.push(url.pathname);
    if (url.pathname.endsWith("/SendRequest")) {
      assert.equal(url.searchParams.get("q"), settings.IBKR_PERSONAL_FLEX_QUERY_ID);
      return new Response("<FlexStatementResponse><Status>Success</Status><ReferenceCode>synthetic-reference</ReferenceCode></FlexStatementResponse>");
    }
    assert.ok(url.pathname.endsWith("/GetStatement"));
    assert.equal(url.searchParams.get("q"), "synthetic-reference");
    return new Response(xml);
  });
  try {
    Object.assign(process.env, settings);
    const { POST } = await import("@/app/api/sync/ibkr/route");
    const refresh = () => POST(new Request("http://localhost/api/sync/ibkr?owner=PERSONAL&mode=evidence", { method: "POST" }));
    const response = await refresh(); assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.evidenceOnly, true); assert.equal(result.imported, 3);
    assert.equal(result.flexFxTransactions, 2); assert.equal(result.flexCashTransactions, 1);
    assert.equal(result.statementFrom, "2026-07-01"); assert.equal(result.statementTo, "2027-06-30");
    assert.equal(result.cashAud, undefined); assert.equal(result.valuationSource, undefined);
    const repeated = await (await refresh()).json();
    assert.equal(repeated.imported, 0); assert.equal(repeated.duplicates, 3); assert.equal(requests.length, 4);
    const after = await readStore();
    for (const key of ["positions", "cashAccounts", "openOrders", "snapshots", "riskSnapshots"] as const) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.transactions.length, 3); assert.equal(after.evidenceDocuments?.length, 1);
    const source = after.evidenceDocuments![0];
    assert.equal(source.metadata.retrievalMethod, "IBKR Flex Web Service"); assert.ok(source.metadata.retrievedAt);
    assert.equal(Buffer.from(source.contentBase64, "base64").toString(), xml);
    assert.equal(source.sha256, sourceHash(xml));
    assert.ok(after.transactions.every((row) => row.raw?._evidenceSourceId === source.id));
    assert.ok(!JSON.stringify(after).includes(settings.IBKR_PERSONAL_FLEX_TOKEN));
    assert.equal((await storage.listTransactions("SMSF")).length, 0); assert.equal((await storage.listEvidenceSources("SMSF")).length, 0);
    const { ibkrFlexConfigForOwner, syncIbkrFlexConfig } = await import("@/lib/sync/ibkr-flex");
    const scheduled = await syncIbkrFlexConfig(storage, ibkrFlexConfigForOwner("PERSONAL")!, "scheduled");
    assert.notEqual(scheduled.evidenceOnly, true); assert.equal(scheduled.duplicates, 3);
    assert.equal(scheduled.flexFxTransactions, 2); assert.equal(scheduled.flexCashTransactions, 1);
    const savedReport = buildTaxEvidenceReport("PERSONAL", await storage.listTransactions("PERSONAL"), await storage.listEvidenceSources("PERSONAL"), [], 2027, at);
    assert.equal(savedReport.conversions.length, 2); assert.equal(savedReport.sources.length, 1);
    assert.ok(savedReport.conversions.every((row) => row.sourceId === source.id));
    assert.equal(savedReport.exceptions.filter((row) => row.code === "missing_source_file").length, 0);
  } finally {
    for (const [key, value] of previous) if (value == null) delete process.env[key]; else process.env[key] = value;
  }
});

test("bank evidence and review history do not change portfolio positions, cash accounts or snapshots", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const { readStore } = await import("@/lib/storage/local-store");
  const storage = new LocalStorageAdapter();
  const outgoing = bank("Westpac", -1000, "OUT");
  const incoming = bank("Macquarie", 1000, "IN");
  await storage.importTaxEvidence(outgoing, "PERSONAL");
  await storage.importTaxEvidence(incoming, "PERSONAL");
  const rows = await storage.listTransactions("PERSONAL");
  const sources = await storage.listEvidenceSources("PERSONAL");
  const report = buildTaxEvidenceReport("PERSONAL", rows, sources, [], 2027, at);
  assert.equal(report.transfers.length, 1); assert.equal(report.transfers[0].status, "candidate");
  const pair = report.transfers[0];
  await storage.recordEvidenceReview({ ownerType: "PERSONAL", outgoingId: pair.outgoingId, incomingId: pair.incomingId, action: "match", note: "Synthetic statements agree", author: "Test reviewer" });
  await assert.rejects(() => storage.recordEvidenceReview({ ownerType: "PERSONAL", outgoingId: pair.outgoingId, incomingId: pair.incomingId, action: "match", note: "Duplicate", author: "Test" }), /already matched/);
  const reviewed = buildTaxEvidenceReport("PERSONAL", rows, sources, await storage.listEvidenceReviews("PERSONAL"), 2027, at);
  assert.equal(reviewed.transfers[0].status, "confirmed");
  await storage.recordEvidenceReview({ ownerType: "PERSONAL", outgoingId: pair.outgoingId, incomingId: pair.incomingId, action: "unmatch", note: "Review reversed", author: "Test reviewer" });
  assert.equal((await storage.listEvidenceReviews("PERSONAL")).length, 2);
  const stored = await readStore();
  assert.deepEqual(stored.positions, []); assert.deepEqual(stored.cashAccounts, []); assert.deepEqual(stored.snapshots, []);
});

test("owner isolation applies to documents, transactions, report building and review decisions", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  const input = bank("Westpac", -1000, "OUT");
  const personal = await storage.importTaxEvidence(input, "PERSONAL");
  const smsf = await storage.importTaxEvidence(input, "SMSF");
  assert.notEqual(personal.sourceId, smsf.sourceId);
  assert.equal(await storage.getEvidenceDocument(personal.sourceId, "SMSF"), null);
  const all = [...await storage.listTransactions("PERSONAL"), ...await storage.listTransactions("SMSF")];
  const report = buildTaxEvidenceReport("PERSONAL", all, [...await storage.listEvidenceSources("PERSONAL"), ...await storage.listEvidenceSources("SMSF")], [], 2027, at);
  assert.equal(report.transactions.length, 1); assert.equal(report.sources.length, 1);
  assert.equal(report.sources[0].ownerType, "PERSONAL");
  assert.throws(() => validateTransferReview({ ownerType: "SMSF", outgoingId: all[0].id, incomingId: all[1].id, action: "match", note: "Wrong owner", author: "Test" }, all, []), /selected legal owner/);
});

test("bank exact IDs are idempotent and source amendments are reported without overwriting", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  assert.equal((await storage.importTaxEvidence(bank("Westpac", -1000, "same-id"), "PERSONAL")).imported, 1);
  assert.equal((await storage.importTaxEvidence(bank("Westpac", -1000, "same-id"), "PERSONAL")).imported, 0);
  const amended = await storage.importTaxEvidence(bank("Westpac", -1100, "same-id"), "PERSONAL");
  assert.equal(amended.conflicts[0].field, "netCash");
  assert.equal((await storage.listTransactions("PERSONAL"))[0].netCash, -1000);
});

test("missing banks, source timezone and balances are exceptions, never fabricated amounts", () => {
  const report = buildTaxEvidenceReport("PERSONAL", [], [], [], 2027, at);
  assert.equal(report.exceptions.filter((row) => row.code === "missing_evidence").length, 4);
  const doc = evidenceDocument(bank("Westpac", -1000, "OUT").source, "PERSONAL", at.toISOString());
  const other = buildTaxEvidenceReport("PERSONAL", [], [doc], [], 2027, at);
  assert.equal(other.balances[0].opening, null); assert.equal(other.balances[0].variance, null);
  assert.equal(other.balances[0].status, "missing_evidence");
});

test("year-end boundaries are inclusive and another owner's file cannot enter a ZIP", async () => {
  const input = bank("Westpac", -1000, "OUT");
  const doc = evidenceDocument(input.source, "PERSONAL", at.toISOString());
  const row = { ...input.transactions[0], id: "boundary", ownerType: "PERSONAL", broker: "Westpac", accountKey: input.source.accountKey } as StoredTransaction;
  const report = buildTaxEvidenceReport("PERSONAL", [row, { ...row, id: "june", tradeDate: "2027-06-30" }, { ...row, id: "july", tradeDate: "2027-07-01" }], [doc], [], 2027, at);
  assert.equal(report.transactions.length, 2);
  assert.throws(() => evidenceZip(report, [evidenceDocument(input.source, "SMSF")], [row]), /owner or source scope/);
  const bytes = evidenceZip(report, [doc], [row]);
  assert.deepEqual(bytes, evidenceZip(report, [doc], [row]));
  const files = unzip(bytes);
  assert.ok(files.has("FX_Conversions.csv")); assert.ok(files.has("Unmatched_Exceptions.csv"));
  const original = [...files.entries()].find(([name]) => name.startsWith("Supporting_Documents/"))![1];
  assert.equal(sourceHash(original), doc.sha256);
  const manifest = JSON.parse(files.get("Manifest.json")!.toString());
  for (const entry of manifest.entries) assert.equal(sourceHash(files.get(entry.path)!), entry.sha256);
});

test("invalid dates, missing bank amounts and malformed FX cannot silently become facts", () => {
  assert.throws(() => evidenceDate("2026-02-30"), /valid date/);
  assert.throws(() => parseBankEvidenceCsv(Buffer.from("Date,Description\n2026-10-01,Missing amount"), { system: "Westpac", accountKey: "test", currency: "USD", filename: "test.csv", startDate: "2026-07-01", endDate: "2027-06-30" }), /Amount or Debit/);
  assert.equal(conversionEvidence({ type: "FX", symbol: "USD.AUD", quantity: 1, price: null } as unknown as StoredTransaction), null);
  assert.ok(evidenceCsv([["=SUM(A1:A2)", 12]]).startsWith("'=SUM"));
});

test("API preview is read-only; report endpoints reject mixed owners and download only their own originals", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { POST } = await import("@/app/api/tax-evidence/import/route");
  const { GET } = await import("@/app/api/reports/tax-evidence/route");
  const original = Buffer.from("Date,Description,Amount,Reference\n2026-10-01,Test transfer,100,TEST\n");
  const request = (commit: boolean) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ owner: "PERSONAL", system: "Westpac", account: "SYNTH", currency: "USD", from: "2026-07-01", to: "2027-06-30" })) form.set(key, value);
    form.set("file", new File([original], "bank.csv"));
    return new Request(`http://localhost/api/tax-evidence/import?commit=${commit ? 1 : 0}`, { method: "POST", body: form });
  };
  const { readStore } = await import("@/lib/storage/local-store");
  const before = JSON.stringify(await readStore());
  const preview = await POST(request(false)); assert.equal(preview.status, 200);
  assert.equal(JSON.stringify(await readStore()), before);
  const imported = await (await POST(request(true))).json(); assert.equal(imported.imported, 1);
  assert.equal((await (await POST(request(true))).json()).imported, 0);
  assert.equal((await GET(new Request("http://localhost/api/reports/tax-evidence?scope=overall&year=2027"))).status, 400);
  assert.equal((await GET(new Request("http://localhost/api/reports/tax-evidence?scope=personal"))).status, 400);
  const report = await (await GET(new Request("http://localhost/api/reports/tax-evidence?scope=personal&year=2027"))).json();
  assert.equal(report.transactions.length, 1);
  const { GET: documentGet } = await import("@/app/api/tax-evidence/documents/[id]/route");
  const context = { params: Promise.resolve({ id: imported.sourceId }) };
  assert.equal((await documentGet(new Request("http://localhost/doc?scope=smsf"), context)).status, 404);
  const document = await documentGet(new Request("http://localhost/doc?scope=personal"), context);
  assert.equal(Buffer.from(await document.arrayBuffer()).equals(original), true);
  assert.equal(document.headers.get("x-content-type-options"), "nosniff");
  const archive = await GET(new Request("http://localhost/api/reports/tax-evidence?scope=personal&year=2027&format=zip"));
  assert.equal(archive.status, 200);
  assert.equal(archive.headers.get("content-type"), "application/zip");
  assert.ok(unzip(Buffer.from(await archive.arrayBuffer())).has("Manifest.json"));
});

test("concurrent transfer confirmations cannot consume the same cash event twice", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  await storage.importTaxEvidence(bank("Westpac", -1000, "OUT"), "PERSONAL");
  await storage.importTaxEvidence(bank("Macquarie", 1000, "IN-1"), "PERSONAL");
  await storage.importTaxEvidence(bank("Macquarie", 1000, "IN-2"), "PERSONAL");
  const rows = await storage.listTransactions("PERSONAL");
  const outgoing = rows.find((row) => row.netCash === -1000)!;
  const incoming = rows.filter((row) => row.netCash === 1000);
  const outcomes = await Promise.allSettled(incoming.map((row) => storage.recordEvidenceReview({ ownerType: "PERSONAL", outgoingId: outgoing.id,
    incomingId: row.id, action: "match", note: "Check original statements", author: "Test" })));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await storage.listEvidenceReviews("PERSONAL")).length, 1);
});

test("repeated narrative bank references do not collapse distinct payments", () => {
  const input = parseBankEvidenceCsv(Buffer.from("Date,Description,Amount,Reference\n2026-10-01,Transfer,100,SAME\n2026-10-02,Transfer,100,SAME\n"), {
    system: "Westpac", accountKey: "SYNTH", currency: "USD", filename: "source.csv", startDate: "2026-07-01", endDate: "2027-06-30",
  });
  assert.equal(input.transactions.length, 2);
  assert.notEqual(input.transactions[0].externalId, input.transactions[1].externalId);
  assert.equal(input.transactions[0].raw?._sourceIdQuality, "file_row");
});

test("an existing source declaration cannot silently acquire different opening or closing balances", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  const input = bank("Westpac", 1000, "IN");
  await storage.importTaxEvidence(input, "PERSONAL");
  const changed = structuredClone(input);
  changed.source.metadata.balances![0].closing = 1200;
  await assert.rejects(() => storage.importTaxEvidence(changed, "PERSONAL"), /different coverage or balances/);
  const sources = await storage.listEvidenceSources("PERSONAL");
  assert.equal(sources[0].metadata.balances![0].closing, null);
});

test("conflicting statement balances cannot report a successful cash reconciliation", () => {
  const first = bank("Westpac", 1000, "IN-1");
  first.source.metadata.balances![0].opening = 0;
  first.source.metadata.balances![0].closing = 1000;
  const second = bank("Westpac", 1000, "IN-2");
  second.source.metadata.balances![0].opening = 0;
  second.source.metadata.balances![0].closing = 2000;
  const report = buildTaxEvidenceReport("PERSONAL", [], [evidenceDocument(first.source, "PERSONAL"), evidenceDocument(second.source, "PERSONAL")], [], 2027, at);
  assert.equal(report.balances[0].status, "conflicting_evidence");
  assert.equal(report.balances[0].variance, null);
  assert.ok(report.exceptions.some((row) => row.code === "conflicting_balance"));
});

test("Westpac PDF preview retains original bytes and does not turn its AUD Available tile into a USD balance", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { POST } = await import("@/app/api/tax-evidence/import/route");
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const { readStore } = await import("@/lib/storage/local-store");
  const bytes = syntheticBankPdf();
  const request = (commit: boolean) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ owner: "PERSONAL", system: "Westpac", account: "SYNTH-USD", currency: "USD", from: "2026-07-01", to: "2027-06-30" })) form.set(key, value);
    form.set("file", new File([bytes], "synthetic-activity.pdf"));
    return new Request(`http://localhost/api/tax-evidence/import?commit=${commit ? 1 : 0}`, { method: "POST", body: form });
  };
  const before = JSON.stringify(await readStore());
  const previewResponse = await POST(request(false));
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.transactions, 4); assert.equal(preview.rows.length, 4); assert.equal(preview.from, "2026-08-05"); assert.equal(preview.to, "2026-08-07");
  assert.equal(JSON.stringify(await readStore()), before);
  const imported = await (await POST(request(true))).json(); assert.equal(imported.imported, 4);
  assert.equal((await (await POST(request(true))).json()).imported, 0);
  const storage = new LocalStorageAdapter();
  const original = await storage.getEvidenceDocument(imported.sourceId, "PERSONAL");
  assert.ok(Buffer.from(original!.contentBase64, "base64").equals(bytes));
  const rows = await storage.listTransactions("PERSONAL");
  assert.equal(rows.reduce((total, row) => total + row.netCash!, 0), 0);
  const report = buildTaxEvidenceReport("PERSONAL", rows, await storage.listEvidenceSources("PERSONAL"), [], 2027, at);
  assert.equal(report.balances[0].opening, null); assert.equal(report.balances[0].closing, null); assert.equal(report.balances[0].status, "missing_evidence");
  assert.equal(report.currencyTotals[0].fees, 10);
  const input = { accountKey: "SYNTH-USD", currency: "USD", filename: "synthetic.pdf", startDate: "2026-07-01", endDate: "2027-06-30" };
  assert.throws(() => parseWestpacActivityText(bankPdfText, bytes, { ...input, currency: "AUD" }), /account-currency/);
  assert.throws(() => parseWestpacActivityText(bankPdfText.replace("-$1200.00", "$1200.00"), bytes, input), /signed debit/);
  assert.throws(() => parseWestpacActivityText(bankPdfText.replace("-$1200.00", "-$1200.00 $1.00"), bytes, input), /ambiguous amount/);
  assert.throws(() => parseWestpacActivityText(bankPdfText + "\n-- 1 of 2 --\n08 Aug 2026 OTHER ROW -$1.00", bytes, input), /partial import/);
});

test("users can log external FX evidence with month precision and originals without duplicating bank cash", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const { readStore } = await import("@/lib/storage/local-store");
  const storage = new LocalStorageAdapter();
  const pdf = syntheticBankPdf();
  await storage.importTaxEvidence(parseWestpacActivityText(bankPdfText, pdf, { accountKey: "SYNTH-USD", currency: "USD", filename: "synthetic.pdf", startDate: "2026-07-01", endDate: "2027-06-30" }), "PERSONAL");
  const transactions = await storage.listTransactions("PERSONAL");
  const funding = transactions.find((row) => row.netCash === -1200)!;
  const before = await readStore();
  const { POST } = await import("@/app/api/tax-evidence/external-fx/route");
  const post = (changes: Record<string, string> = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ owner: "PERSONAL", provider: "Synthetic FX", account: "SYNTH-PROVIDER", month: "2026-08", fromCurrency: "USD", fromAmount: "1200", toCurrency: "AUD", toAmount: "1800", fundingTransactionId: funding.id, pairingStatus: "user_confirmed", evidenceBasis: "user_reported", note: "User confirms this funding and payout belong to the same transfer. Exact conversion day and fees remain unknown.", ...changes })) form.set(key, value);
    form.set("support", new File(["Synthetic user payout confirmation"], "confirmation.txt"));
    return POST(new Request("http://localhost/api/tax-evidence/external-fx", { method: "POST", body: form }));
  };
  const response = await post(); assert.equal(response.status, 200);
  const recorded = await response.json(); assert.equal(recorded.recorded, true); assert.equal(recorded.amountImpliedRate, 1.5);
  assert.equal((await post()).status, 200);
  const after = await readStore();
  assert.deepEqual(after.transactions, before.transactions);
  for (const key of ["positions", "cashAccounts", "openOrders", "snapshots"] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(after.evidenceDocuments!.length, 3);
  const report = buildTaxEvidenceReport("PERSONAL", transactions, await storage.listEvidenceSources("PERSONAL"), [], 2027, at);
  assert.equal(report.externalFx.length, 1); assert.equal(report.externalFx[0].conversionDate, null); assert.equal(report.externalFx[0].month, "2026-08");
  assert.equal(report.externalFx[0].fundingDate, "2026-08-06"); assert.equal(report.externalFx[0].pairingStatus, "user_confirmed");
  assert.equal(report.externalFx[0].feeAmount, null); assert.equal(report.externalFx[0].quotedRate, null);
  assert.ok(report.exceptions.some((row) => row.code === "external_fx_date_unknown"));
  assert.ok(!report.exceptions.some((row) => row.code === "unmatched_cash" && row.transactionId === funding.id));
  assert.equal(report.balances.length, 1); assert.equal(report.balances[0].movement, 0); assert.equal(report.currencyTotals.some((row) => row.currency === "AUD"), false);
  const files = unzip(evidenceZip(report, after.evidenceDocuments!, after.transactions));
  assert.ok(files.get("External_FX_Evidence.csv")!.toString().includes("user_confirmed"));
  assert.ok([...files.values()].some((data) => data.equals(Buffer.from("Synthetic user payout confirmation"))));
  const count = after.evidenceDocuments!.length;
  assert.equal((await post({ owner: "SMSF" })).status, 400);
  assert.equal((await post({ fromAmount: "1201" })).status, 400);
  assert.equal((await post({ evidenceBasis: "provider_confirmation" })).status, 400);
  assert.equal((await post({ conversionDate: "2026-09-01" })).status, 400);
  assert.equal((await readStore()).evidenceDocuments!.length, count);
  const other = buildTaxEvidenceReport("SMSF", transactions, after.evidenceDocuments!, [], 2027, at);
  assert.equal(other.externalFx.length, 0);
});

test("external declarations retain year boundaries and cannot silently change facts for the same original", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  const row = readExternalFx({ provider: "Synthetic FX", month: "2027-07", fromCurrency: "USD", fromAmount: "10", toCurrency: "AUD", toAmount: "15", feeAmount: "0", feeCurrency: "AUD", note: "July activity; exact date unknown." }, "Test");
  const input = externalFxImport(row, "SYNTH", []);
  await storage.importTaxEvidence(input, "PERSONAL");
  const source = await storage.listEvidenceSources("PERSONAL");
  assert.equal(buildTaxEvidenceReport("PERSONAL", [], source, [], 2027, at).externalFx.length, 0);
  assert.equal(buildTaxEvidenceReport("PERSONAL", [], source, [], 2028, at).externalFx[0].feeAmount, 0);
  const changed = structuredClone(input); changed.source.metadata.externalFx!.toAmount = 20;
  await assert.rejects(() => storage.importTaxEvidence(changed, "PERSONAL"), /different coverage or balances/);
});

test("external FX payouts reconcile to receiving credits with append-only undo and no changed cash facts", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const { readStore } = await import("@/lib/storage/local-store");
  const { POST } = await import("@/app/api/tax-evidence/reviews/route");
  const storage = new LocalStorageAdapter();
  await storage.importTaxEvidence(bank("Westpac", -1000, "FX-FUND"), "PERSONAL");
  const credit = parseBankEvidenceCsv(Buffer.from("Date,Description,Currency,Amount,EvidenceBasis,UnlabelledAdjacentValue\n2026-10-02,From Synthetic FX,AUD,1500,User-transcribed bank activity,1599.50\n"), {
    system: "Macquarie", accountKey: "SYNTH-AUD", currency: "AUD", filename: "user-transcribed.csv", startDate: "2026-10-01", endDate: "2026-10-02",
  });
  await storage.importTaxEvidence(credit, "PERSONAL");
  const rows = await storage.listTransactions("PERSONAL");
  const outgoing = rows.find((row) => row.netCash === -1000)!;
  const incoming = rows.find((row) => row.netCash === 1500)!;
  const declaration = readExternalFx({ provider: "Synthetic FX", month: "2026-10", fromCurrency: "USD", fromAmount: 1000, toCurrency: "AUD", toAmount: 1500,
    fundingTransactionId: outgoing.id, note: "Exact execution date and fees not supplied." }, "Test");
  const original = await storage.importTaxEvidence(externalFxImport(declaration, "SYNTH-FX", []), "PERSONAL");
  const before = await readStore();
  const input = { ownerType: "PERSONAL", outgoingId: outgoing.id, incomingId: incoming.id, externalFxId: original.sourceId, action: "match", note: "Payer, amount and date agree with the user-transcribed receiving entry." };
  const post = (changes = {}) => POST(new Request("http://localhost/api/tax-evidence/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, ...changes }) }));
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 400);
  assert.equal((await post({ ownerType: "SMSF" })).status, 400);
  assert.equal((await post({ externalFxId: "0".repeat(64) })).status, 400);
  assert.equal((await post({ externalFxId: undefined })).status, 400);
  const sources = await storage.listEvidenceSources("PERSONAL");
  const reviews = await storage.listEvidenceReviews("PERSONAL");
  const report = buildTaxEvidenceReport("PERSONAL", rows, sources, reviews, 2027, at);
  const receipt = report.externalFx[0].receipt!;
  assert.equal(receipt.date, "2026-10-02"); assert.equal(receipt.amount, 1500); assert.equal(receipt.transactionId, incoming.id);
  assert.equal(receipt.sourceBasis, "User-transcribed bank activity");
  assert.equal(report.externalFx[0].conversionDate, null); assert.equal(report.externalFx[0].pairingStatus, "provisional");
  assert.equal(report.transfers.length, 0); assert.equal(report.reviews.length, 1);
  assert.ok(!report.exceptions.some((row) => row.code === "unmatched_cash" && [outgoing.id, incoming.id].includes(row.transactionId!)));
  assert.ok(report.exceptions.some((row) => row.code === "user_transcribed_bank_source"));
  const after = await readStore();
  for (const key of ["transactions", "positions", "cashAccounts", "snapshots", "evidenceDocuments"] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(incoming.raw!.UnlabelledAdjacentValue, "1599.50"); assert.equal(incoming.raw!._statementBalance, null);
  const files = unzip(evidenceZip(report, after.evidenceDocuments!, rows));
  assert.match(files.get("External_FX_Evidence.csv")!.toString(), /receipt_date/);
  assert.match(files.get("External_FX_Evidence.csv")!.toString(), /2026-10-02/);
  assert.equal(JSON.parse(files.get("Review_History.json")!.toString())[0].externalFxId, original.sourceId);
  assert.equal((await post({ action: "unmatch", note: "Review undone; originals retained." })).status, 200);
  const undone = buildTaxEvidenceReport("PERSONAL", rows, sources, await storage.listEvidenceReviews("PERSONAL"), 2027, at);
  assert.equal(undone.externalFx[0].receipt, null); assert.equal(undone.reviews.length, 2);
  assert.ok(undone.exceptions.some((row) => row.code === "external_fx_receipt_unlinked"));
});

test("FX receipt reviews reject wrong payout amounts and retain cross-year receiving evidence", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local");
  const storage = new LocalStorageAdapter();
  const out = bank("Westpac", -20, "FY-FUND"); out.transactions[0].tradeDate = "2027-06-30";
  await storage.importTaxEvidence(out, "PERSONAL");
  await storage.importTaxEvidence(parseBankEvidenceCsv(Buffer.from("Date,Description,Amount,TransactionID\n2027-07-01,Test FX,30,FY-RECEIPT\n"), {
    system: "Macquarie", accountKey: "SYNTH", currency: "AUD", filename: "july.csv", startDate: "2027-07-01", endDate: "2027-07-01",
  }), "PERSONAL");
  const rows = await storage.listTransactions("PERSONAL"); const incoming = rows.find((row) => row.netCash === 30)!; const funding = rows.find((row) => row.netCash === -20)!;
  const input = externalFxImport(readExternalFx({ provider: "Test FX", month: "2027-06", fromCurrency: "USD", fromAmount: 20, toCurrency: "AUD", toAmount: 30,
    fundingTransactionId: funding.id, note: "June funding, July receipt; execution date unknown." }, "Test"), "SYNTH", []);
  const saved = await storage.importTaxEvidence(input, "PERSONAL"); const sources = await storage.listEvidenceSources("PERSONAL");
  const review = { ownerType: "PERSONAL" as const, outgoingId: funding.id, incomingId: incoming.id, externalFxId: saved.sourceId, action: "match" as const, note: "Cross-year receipt verified.", author: "Test" };
  assert.throws(() => validateTransferReview(review, rows.map((row) => row.id === incoming.id ? { ...row, netCash: 31 } : row), [], sources), /payout currency and amount/);
  assert.throws(() => validateTransferReview(review, rows.map((row) => row.id === incoming.id ? { ...row, currency: "USD" } : row), [], sources), /payout currency and amount/);
  await storage.recordEvidenceReview(review);
  const july = buildTaxEvidenceReport("PERSONAL", rows, sources, await storage.listEvidenceReviews("PERSONAL"), 2028, at);
  assert.equal(july.externalFx.length, 1); assert.equal(july.externalFx[0].month, "2027-06"); assert.equal(july.externalFx[0].receipt?.date, "2027-07-01");
  assert.equal(july.sources.length, 3);
  const june = buildTaxEvidenceReport("PERSONAL", rows, sources, await storage.listEvidenceReviews("PERSONAL"), 2027, at);
  const { readStore } = await import("@/lib/storage/local-store");
  const store = await readStore(); const selectedDocs = store.evidenceDocuments!.filter((d) => june.sources.some((s) => s.id === d.id));
  const files = unzip(evidenceZip(june, selectedDocs, rows));
  assert.equal(JSON.parse(files.get("Canonical_Transactions.json")!.toString()).length, 2);
});

test("review notes round-trip FX identity without reinterpreting historical human notes", () => {
  const input = { note: "Receipt confirmed; original source retained.", externalFxId: "a".repeat(64) };
  assert.deepEqual(decodeReviewNote(encodeReviewNote(input)), input);
  assert.deepEqual(decodeReviewNote("Legacy transfer note"), { note: "Legacy transfer note" });
  const prefixedHuman = { note: "SS-EVIDENCE-REVIEW-V1:human supplied text" };
  assert.deepEqual(decodeReviewNote(encodeReviewNote(prefixedHuman)), prefixedHuman);
  assert.deepEqual(decodeReviewNote('SS-EVIDENCE-REVIEW-V1:{"note":"Human note","ownerType":"SMSF","incomingId":"other"}'), { note: "Human note" });
});

test("concurrent FX reviews cannot reuse a receiving-bank credit", async () => {
  writeFileSync(dataFile, JSON.stringify(empty));
  const { LocalStorageAdapter } = await import("@/lib/storage/local"); const storage = new LocalStorageAdapter();
  await storage.importTaxEvidence(bank("Westpac", -20, "FUND-A"), "PERSONAL");
  await storage.importTaxEvidence(bank("Westpac", -20, "FUND-B"), "PERSONAL");
  await storage.importTaxEvidence(parseBankEvidenceCsv(Buffer.from("Date,Description,Amount,TransactionID\n2026-10-02,Test FX,30,ONE-CREDIT\n"), {
    system: "Macquarie", accountKey: "SYNTH-AUD", currency: "AUD", filename: "credit.csv", startDate: "2026-10-01", endDate: "2026-10-02",
  }), "PERSONAL");
  const rows = await storage.listTransactions("PERSONAL"); const credit = rows.find((row) => row.netCash === 30)!;
  const reviews = [];
  for (const funding of rows.filter((row) => row.netCash === -20)) {
    const doc = await storage.importTaxEvidence(externalFxImport(readExternalFx({ provider: "Test FX", month: "2026-10", fromCurrency: "USD", fromAmount: 20,
      toCurrency: "AUD", toAmount: 30, fundingTransactionId: funding.id, note: "Synthetic payout." }, "Test"), "SYNTH-FX", []), "PERSONAL");
    reviews.push({ ownerType: "PERSONAL" as const, outgoingId: funding.id, incomingId: credit.id, externalFxId: doc.sourceId, action: "match" as const, note: "Review incoming credit.", author: "Test" });
  }
  const outcomes = await Promise.allSettled(reviews.map((review) => storage.recordEvidenceReview(review)));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await storage.listEvidenceReviews("PERSONAL")).length, 1);
});
