import assert from "node:assert/strict";
import test from "node:test";
import { parseAsxAnnouncements } from "./asx";
import { describe8kItems, isMaterialSecForm, isOwnershipSecForm, parseSecFilings, parseTickerMap, secDocumentUrl } from "./sec";
import { parseYahooHeadlines } from "./yahoo";
import { hasMaterialNews, issuerNamesAgree, newsVenueForExchange, orderNews } from "./types";

const asxPayload = {
  data: {
    displayName: "WESTGOLD RESOURCES LIMITED.",
    items: [
      { announcementType: "PROGRESS REPORT", date: "2026-08-19T21:59:02.000Z", documentKey: "2924-03123164-6A1339312", headline: "2026 Mineral Resource Estimate and Ore Reserves", isPriceSensitive: true },
      { announcementType: "SECURITY HOLDER DETAILS", date: "2026-08-12T06:52:31.000Z", documentKey: "2924-03120481-6A1338329", headline: "Change of Director's Interest Notice - W. Bramwell", isPriceSensitive: false },
    ],
  },
};

test("an ASX announcement carries the exchange's own price-sensitive flag", () => {
  const items = parseAsxAnnouncements("WGX", asxPayload);
  assert.equal(items.length, 2);
  assert.equal(items[0].material, true, "a mineral resource estimate is flagged sensitive");
  assert.equal(items[1].material, false, "a director's interest notice is routine");
  assert.equal(items[0].kind, "PROGRESS REPORT");
  assert.equal(items[0].source, "ASX");
  assert.equal(items[0].publishedAt, "2026-08-19T21:59:02.000Z");
});

test("the announcement links straight to its PDF", () => {
  // The feed's own `url` field comes back empty, so the link is built from the document key.
  const [item] = parseAsxAnnouncements("WGX", asxPayload);
  assert.equal(item.url, "https://asx.api.markitdigital.com/asx-research/1.0/file/2924-03123164-6A1339312");
});

test("malformed ASX rows are skipped rather than charted as newsless", () => {
  const payload = { data: { items: [
    { headline: "No key", date: "2026-08-19T00:00:00.000Z" },
    { headline: "Bad date", documentKey: "abc", date: "not a date" },
    { documentKey: "abc", date: "2026-08-19T00:00:00.000Z" },
  ] } };
  assert.deepEqual(parseAsxAnnouncements("WGX", payload), []);
  assert.deepEqual(parseAsxAnnouncements("WGX", null), []);
  assert.deepEqual(parseAsxAnnouncements("WGX", { data: {} }), []);
});

test("only the SEC forms reserved for material events raise a flag", () => {
  // A 40-F is an annual report: scheduled, not an event. Flagging it would cry wolf every year.
  for (const form of ["8-K", "6-K", "8-K/A"]) assert.equal(isMaterialSecForm(form), true, form);
  for (const form of ["40-F", "20-F", "10-Q", "10-K", "SC 13G", "4"]) assert.equal(isMaterialSecForm(form), false, form);
});

test("EDGAR's parallel arrays are read by index", () => {
  const payload = { filings: { recent: {
    form: ["8-K", "4", "40-F"],
    filingDate: ["2026-08-13", "2026-08-11", "2026-02-20"],
    accessionNumber: ["0001104659-26-095968", "0001104659-26-095000", "0001104659-26-020000"],
    primaryDocument: ["tm2623048d1_8k.htm", "form4.xml", "tm40f.htm"],
    primaryDocDescription: ["FORM 8-K", "", "Annual report"],
  } } };
  const items = parseSecFilings("NEM", 1164727, payload);
  assert.deepEqual(items.map((item) => item.kind), ["8-K", "40-F"], "the Form 4 is not company news");
  assert.equal(items[0].material, true);
  assert.equal(items[1].material, false);
  // "FORM 8-K" as a description tells the reader nothing they cannot already see in the form.
  assert.equal(items[0].headline, "8-K filing");
  assert.equal(items[1].headline, "Annual report");
  assert.equal(items[0].url, "https://www.sec.gov/Archives/edgar/data/1164727/000110465926095968/tm2623048d1_8k.htm");
});

test("a filing with no primary document still links to its folder", () => {
  assert.equal(secDocumentUrl(1164727, "0001104659-26-095968", ""), "https://www.sec.gov/Archives/edgar/data/1164727/000110465926095968");
});

test("the SEC ticker map is keyed by upper-case ticker", () => {
  const map = parseTickerMap({ "0": { cik_str: 1385849, ticker: "UUUU", title: "ENERGY FUELS INC" }, "1": { cik_str: 1340677, ticker: "svm", title: "SILVERCORP" }, "2": { ticker: "BAD" } });
  assert.equal(map.get("UUUU"), 1385849);
  assert.equal(map.get("SVM"), 1340677, "lower-case tickers in the source still resolve");
  assert.equal(map.get("BAD"), undefined, "a row with no CIK is dropped");
});

test("media headlines are parsed but never marked material", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Why Newmont Rallied & Rose]]></title><link>https://finance.yahoo.com/news/a.html</link><pubDate>Wed, 19 Aug 2026 20:42:12 +0000</pubDate></item>
    <item><title>No date here</title><link>https://example.com/b</link></item>
  </channel></rss>`;
  const items = parseYahooHeadlines("NEM", xml);
  assert.equal(items.length, 1, "the undated item is dropped");
  assert.equal(items[0].headline, "Why Newmont Rallied & Rose", "CDATA is unwrapped and entities decoded");
  assert.equal(items[0].material, false, "a journalist's judgement is not the issuer's declaration");
  assert.equal(items[0].source, "Yahoo Finance");
});

test("each listing routes to a provider that can speak for it", () => {
  assert.equal(newsVenueForExchange("ASX"), "asx");
  assert.equal(newsVenueForExchange("NYSE"), "sec");
  assert.equal(newsVenueForExchange("NYSEARCA"), "sec");
  // Canadian miners in this book file with the SEC, so a 6-K beats a headline where one exists.
  assert.equal(newsVenueForExchange("TSX"), "sec");
  assert.equal(newsVenueForExchange("TSXV"), "sec");
  assert.equal(newsVenueForExchange("LSE"), "yahoo");
});

test("news is ordered newest first and stripped of unusable rows", () => {
  const items = orderNews([
    { symbol: "A", headline: "older", url: "u", publishedAt: "2026-08-01T00:00:00.000Z", source: "ASX", kind: "", material: false },
    { symbol: "A", headline: "newest", url: "u", publishedAt: "2026-08-19T00:00:00.000Z", source: "ASX", kind: "", material: true },
    { symbol: "A", headline: "no link", url: "", publishedAt: "2026-08-20T00:00:00.000Z", source: "ASX", kind: "", material: true },
  ]);
  assert.deepEqual(items.map((item) => item.headline), ["newest", "older"]);
});

test("the badge only lights for material news inside the window", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  const material = (publishedAt: string, isMaterial = true) => ([{ symbol: "WGX", headline: "h", url: "u", publishedAt, source: "ASX" as const, kind: "", material: isMaterial }]);
  assert.equal(hasMaterialNews(material("2026-08-19T00:00:00.000Z"), 14, now), true);
  assert.equal(hasMaterialNews(material("2026-07-01T00:00:00.000Z"), 14, now), false, "outside the window");
  assert.equal(hasMaterialNews(material("2026-08-19T00:00:00.000Z", false), 14, now), false, "routine filings never badge");
  assert.equal(hasMaterialNews([], 14, now), false);
});

test("a material filing survives a wall of newer routine ones", () => {
  // Energy Fuels' recent filings were all Schedule 13G/A and Form 4 traffic. A plain newest-first
  // cap dropped the 8-K underneath them, and the badge went with it.
  const now = new Date("2026-08-20T00:00:00.000Z");
  const routine = Array.from({ length: 10 }, (_, index) => ({
    symbol: "UUUU", headline: `Form 4 ${index}`, url: "u",
    publishedAt: `2026-08-${String(19 - index).padStart(2, "0")}T00:00:00.000Z`,
    source: "SEC" as const, kind: "4", material: false,
  }));
  const material = { symbol: "UUUU", headline: "8-K filing", url: "u", publishedAt: "2026-08-12T00:00:00.000Z", source: "SEC" as const, kind: "8-K", material: true };

  const ordered = orderNews([...routine, material], 8, 14, now);
  assert.ok(ordered.some((item) => item.kind === "8-K"), "the 8-K must not be crowded out");
  assert.equal(ordered.length, 8, "the cap still holds");
  assert.equal(hasMaterialNews(ordered, 14, now), true);
  // Order is still newest-first once the material item is folded back in.
  assert.deepEqual([...ordered].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), ordered);
});

test("a material release older than the window does not displace recent news", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  const stale = { symbol: "A", headline: "old 8-K", url: "u", publishedAt: "2026-01-02T00:00:00.000Z", source: "SEC" as const, kind: "8-K", material: true };
  const recent = Array.from({ length: 8 }, (_, index) => ({
    symbol: "A", headline: `note ${index}`, url: "u",
    publishedAt: `2026-08-${String(19 - index).padStart(2, "0")}T00:00:00.000Z`,
    source: "SEC" as const, kind: "4", material: false,
  }));
  const ordered = orderNews([stale, ...recent], 8, 14, now);
  assert.equal(ordered.length, 8);
  assert.ok(!ordered.some((item) => item.headline === "old 8-K"));
});

test("a ticker that resolves to an unrelated filer is a collision, not a match", () => {
  // A CIK is looked up by ticker, which is only authoritative for a US listing. The same ticker on
  // the TSX and on Nasdaq can be different companies, and filings from the wrong one are worse
  // than none: they would badge a row with another company's material event.
  assert.equal(issuerNamesAgree("Western Copper & Gold", "Western Copper & Gold Corp"), true);
  assert.equal(issuerNamesAgree("Avino Silver residual", "AVINO SILVER & GOLD MINES LTD"), true);
  assert.equal(issuerNamesAgree("Silvercorp Metals", "SILVERCORP METALS INC"), true);
  assert.equal(issuerNamesAgree("Pan American Silver", "PAN AMERICAN SILVER CORP"), true);
  assert.equal(issuerNamesAgree("MAG Silver", "Magnachip Semiconductor Corp"), false);
});

test("the name guard stays out of the way when it cannot judge", () => {
  // Generic words alone must not decide a match: every miner shares "gold" or "resources". With
  // nothing distinctive left, the guard abstains rather than guess — hiding real filings would be
  // the worse error.
  assert.equal(issuerNamesAgree("Gold Mining Corp", "Barrick Gold Corporation"), true);
  assert.equal(issuerNamesAgree("", "ANYTHING INC"), true, "no held name means no opinion");
  assert.equal(issuerNamesAgree("Newmont", ""), true, "no filer name means no opinion");
});

test("ownership reports are not company news and never reach the list", () => {
  // Newmont's four most recent filings were three Form 4s and an 8-K. Left in, the reading list
  // becomes a register of who traded the stock rather than what the company did.
  for (const form of ["3", "4", "5", "4/A", "144", "SC 13G", "SC 13D/A"]) {
    assert.equal(isOwnershipSecForm(form), true, form);
  }
  for (const form of ["8-K", "6-K", "10-Q", "10-K", "40-F", "S-8"]) {
    assert.equal(isOwnershipSecForm(form), false, form);
  }
});

test("an 8-K is described by what triggered it, not by its form number", () => {
  // Newmont's real item codes. 9.01 is exhibits and 7.01 is a disclosure wrapper: both accompany
  // the filing rather than explain it, so a substantive code wins whenever one is present.
  assert.equal(describe8kItems("1.01,7.01,9.01"), "Entered a material agreement");
  assert.equal(describe8kItems("2.02,9.01"), "Results of operations and financial condition");
  assert.equal(describe8kItems("5.02,7.01,9.01"), "Director or officer change");
  assert.equal(describe8kItems("5.07"), "Shareholder vote results");
  // With nothing but ancillary codes, the wrapper is better than a bare form number.
  assert.equal(describe8kItems("7.01,9.01"), "Regulation FD disclosure");
  assert.equal(describe8kItems("9.01"), "");
  assert.equal(describe8kItems(""), "");
});

test("the item description becomes the headline", () => {
  const payload = { filings: { recent: {
    form: ["8-K"], filingDate: ["2026-08-13"], accessionNumber: ["0001104659-26-095968"],
    primaryDocument: ["a.htm"], primaryDocDescription: ["FORM 8-K"], items: ["2.02,9.01"],
  } } };
  const [item] = parseSecFilings("NEM", 1164727, payload);
  assert.equal(item.headline, "Results of operations and financial condition");
});
