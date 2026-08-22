import test from "node:test";
import assert from "node:assert/strict";
import { buildFundamentalResearchDraft, normaliseResearchSymbol, validateResearchSourceUrl } from "./research-draft";

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
