import test from "node:test";
import assert from "node:assert/strict";
import { asxIssuerMismatch, buildFundamentalResearchDraft, fetchResearchSource, normaliseResearchSymbol, validateResearchSourceUrl } from "./research-draft";

test("buildFundamentalResearchDraft extracts clear source facts into a pending draft input", () => {
  const draft = buildFundamentalResearchDraft({
    symbol: " cmm.ax ",
    sourceUrl: "https://example.com/report",
    sourceTitle: "Quarterly report",
    sourceText: `Quarterly report 31 July 2026. Cash and cash equivalents A$125.4m. Debt A$14.2m.
      Production was 120,000 oz. AISC US$1,248 per oz. Mineral resources 4.8 Moz. Ore reserves 1.7 Moz. IRR 31%.`,
  });

  assert.equal(draft.symbol, "CMM.AX");
  assert.equal(draft.cashAud, 125_400_000);
  assert.equal(draft.debtAud, 14_200_000);
  assert.equal(draft.productionOz, 120_000);
  assert.equal(draft.aiscUsdPerOz, 1_248);
  assert.equal(draft.resourceMoz, 4.8);
  assert.equal(draft.reserveMoz, 1.7);
  assert.equal(draft.irrPercent, 31);
  assert.equal(draft.sourceDate, "2026-07-31");
  assert.equal(draft.jurisdictionScore, null);
  assert.match(draft.notes ?? "", /Review every field/);
});

test("buildFundamentalResearchDraft carries a source discovery note", () => {
  const draft = buildFundamentalResearchDraft({
    symbol: "CMM",
    sourceUrl: "https://example.com/cmm.pdf",
    sourceText: "Annual report 2026. Cash A$50m.",
    discoveryNote: "Source discovered from ASX using CMM:ASX.",
  });

  assert.match(draft.notes ?? "", /Source discovered from ASX/);
  assert.equal(draft.cashAud, 50_000_000);
});

test("buildFundamentalResearchDraft does not map uranium pounds into ounce fields", () => {
  const draft = buildFundamentalResearchDraft({
    symbol: "UUUU",
    sourceText: "Produced 1.2 million pounds of uranium and held cash A$45m on 2026-06-30.",
  });

  assert.equal(draft.productionOz, null);
  assert.equal(draft.cashAud, 45_000_000);
});

test("symbol and source URL guards reject unsafe research inputs", () => {
  assert.equal(normaliseResearchSymbol(" xle "), "XLE");
  assert.throws(() => validateResearchSourceUrl("file:///tmp/report.html"), /http or https/);
  assert.throws(() => validateResearchSourceUrl("http://127.0.0.1/report"), /private or local/);
});


test("fetchResearchSource accepts PDF announcements", async () => {
  const pdf = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 74 >>
stream
BT
/F1 24 Tf
100 700 Td
(Quarterly report Cash A$125.4m) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000365 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
435
%%EOF`;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf" },
  });

  try {
    const source = await fetchResearchSource("https://example.com/announcement");
    assert.match(source.text, /Quarterly report/);
    assert.equal(source.title, null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});


test("asxIssuerMismatch rejects cross-referenced ASX announcements", () => {
  const latitudeSource = "ASX Announcement ASX:LAT Piastri joins Ricciardo to unlock value for Latitude 66 Capricorn Metals Limited (ASX:CMM)";
  assert.equal(asxIssuerMismatch("CMM", latitudeSource), "LAT");
  assert.equal(asxIssuerMismatch("CMM.AX", "ASX Announcement ASX:CMM Quarterly activities report"), null);
  assert.equal(asxIssuerMismatch("CMM", "Capricorn Metals quarterly report with no ASX header"), null);
});
