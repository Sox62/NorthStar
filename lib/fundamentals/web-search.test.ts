import test from "node:test";
import assert from "node:assert/strict";
import { fetchFundamentalWebCandidates } from "./web-search";

test("fetchFundamentalWebCandidates returns no candidates without a search key", async () => {
  const previousBrave = process.env.BRAVE_SEARCH_API_KEY;
  const previousTavily = process.env.TAVILY_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    assert.deepEqual(await fetchFundamentalWebCandidates({ symbol: "CMM", name: "Capricorn Metals" }), []);
  } finally {
    if (previousBrave == null) delete process.env.BRAVE_SEARCH_API_KEY; else process.env.BRAVE_SEARCH_API_KEY = previousBrave;
    if (previousTavily == null) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousTavily;
  }
});

test("fetchFundamentalWebCandidates maps Brave search results into research candidates", async () => {
  const previousFetch = globalThis.fetch;
  const previousBrave = process.env.BRAVE_SEARCH_API_KEY;
  const previousTavily = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.match(url, /api\.search\.brave\.com/);
    assert.equal((init?.headers as Record<string, string>)["X-Subscription-Token"], "test-key");
    return new Response(JSON.stringify({ web: { results: [{ title: "Capricorn Metals investor presentation PDF", url: "https://capmetals.com.au/presentation.pdf", description: "AISC cash resources reserves" }] } }), { headers: { "content-type": "application/json" } });
  };

  try {
    const items = await fetchFundamentalWebCandidates({ symbol: "CMM", name: "Capricorn Metals" });
    assert.equal(items.length, 1);
    assert.equal(items[0].source, "Web Search");
    assert.equal(items[0].url, "https://capmetals.com.au/presentation.pdf");
    assert.match(items[0].headline, /presentation/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBrave == null) delete process.env.BRAVE_SEARCH_API_KEY; else process.env.BRAVE_SEARCH_API_KEY = previousBrave;
    if (previousTavily == null) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousTavily;
  }
});
