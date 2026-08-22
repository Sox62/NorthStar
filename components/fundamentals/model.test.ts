import test from "node:test";
import assert from "node:assert/strict";
import { blankResearchForm, importResearchTemplateJson, researchTemplatePrompt } from "./model";

test("researchTemplatePrompt asks for strict JSON for the current ticker", () => {
  const prompt = researchTemplatePrompt({ symbol: "cmm", name: "Capricorn Metals" });
  assert.match(prompt, /Research CMM Capricorn Metals/);
  assert.match(prompt, /Return ONLY valid JSON/);
  assert.match(prompt, /"symbol": "TICKER"/);
  assert.match(prompt, /"cashAud": null/);
});

test("importResearchTemplateJson maps browser AI JSON into the research form", () => {
  const form = importResearchTemplateJson(blankResearchForm, JSON.stringify({
    symbol: "cmm",
    name: "Capricorn Metals",
    primary_metal: "Gold",
    project_stage: "Producer",
    as_of_date: "2026-06-30",
    production_oz: 120000,
    aisc_usd_per_oz: "1,248",
    resource_moz: 4.8,
    reserve_moz: 1.7,
    cash_aud: 125400000,
    balance_sheet_score: 4,
    source_url: "https://capmetals.com.au/presentation.pdf",
    notes: "Facts sourced from company presentation.",
  }));

  assert.equal(form.symbol, "CMM");
  assert.equal(form.primaryMetal, "Gold");
  assert.equal(form.projectStage, "Producer");
  assert.equal(form.asOfDate, "2026-06-30");
  assert.equal(form.productionOz, "120000");
  assert.equal(form.aiscUsdPerOz, "1248");
  assert.equal(form.resourceMoz, "4.8");
  assert.equal(form.balanceSheetScore, "4");
  assert.equal(form.sourceUrl, "https://capmetals.com.au/presentation.pdf");
});

test("importResearchTemplateJson rejects out-of-range judgement scores", () => {
  assert.throws(
    () => importResearchTemplateJson(blankResearchForm, '{"symbol":"CMM","balanceSheetScore":8}'),
    /balanceSheetScore must be 0-5/,
  );
});
