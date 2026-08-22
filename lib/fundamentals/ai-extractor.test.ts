import assert from "node:assert/strict";
import test from "node:test";
import { buildAiFundamentalResearchDraft, parseAiJson } from "./ai-extractor";

test("parseAiJson unwraps fenced JSON", () => {
  assert.deepEqual(parseAiJson('```json\n{"cashAud":125000000,"confidence":0.8}\n```'), { cashAud: 125000000, confidence: 0.8 });
});

test("buildAiFundamentalResearchDraft fails clearly without selected provider key", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () => buildAiFundamentalResearchDraft({ symbol: "CMM", sourceText: "Cash A$125m." }, "openai"),
    /OPENAI_API_KEY is not configured/,
  );
  process.env.OPENAI_API_KEY = previous;
});

test("buildAiFundamentalResearchDraft maps OpenAI factual JSON into a pending draft", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    assert.match(String((init as RequestInit).headers && JSON.stringify((init as RequestInit).headers)), /Bearer test-key/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ cashAud: 125_000_000, primaryMetal: "Gold", notes: "Cash was stated in the report.", confidence: 0.77 }) } }] });
  };

  try {
    const draft = await buildAiFundamentalResearchDraft({ symbol: "CMM", sourceUrl: "https://example.com/cmm.pdf", sourceText: "Quarterly report. Cash A$125m." }, "openai");
    assert.equal(draft.cashAud, 125_000_000);
    assert.equal(draft.primaryMetal, "Gold");
    assert.equal(draft.jurisdictionScore, null, "AI extraction does not fill judgement scores");
    assert.equal(draft.extractor, "openai-factual-extractor");
    assert.equal(draft.confidence, 0.77);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.OPENAI_API_KEY = previousKey;
  }
});

test("buildAiFundamentalResearchDraft maps Anthropic factual JSON into a pending draft", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    assert.match(String((init as RequestInit).headers && JSON.stringify((init as RequestInit).headers)), /test-key/);
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ resourceMoz: 4.8, sourceExcerpt: "Mineral resources 4.8 Moz", confidence: 0.7 }) }] });
  };

  try {
    const draft = await buildAiFundamentalResearchDraft({ symbol: "CMM", sourceText: "Mineral resources 4.8 Moz." }, "anthropic");
    assert.equal(draft.resourceMoz, 4.8);
    assert.equal(draft.sourceExcerpt, "Mineral resources 4.8 Moz");
    assert.equal(draft.extractor, "anthropic-factual-extractor");
  } finally {
    globalThis.fetch = previousFetch;
    process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
