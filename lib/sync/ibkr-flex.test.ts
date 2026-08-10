import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { configuredIbkrFlexSyncs, ibkrFlexConfigForOwner } from "./ibkr-flex";

const keys = [
  "IBKR_FLEX_TOKEN",
  "IBKR_FLEX_QUERY_ID",
  "IBKR_FLEX_OWNER",
  "IBKR_PERSONAL_FLEX_TOKEN",
  "IBKR_PERSONAL_FLEX_QUERY_ID",
  "IBKR_SMSF_FLEX_TOKEN",
  "IBKR_SMSF_FLEX_QUERY_ID",
  "IBKR_TRADE_CONFIRM_FLEX_QUERY_ID",
  "IBKR_PERSONAL_TRADE_CONFIRM_FLEX_QUERY_ID",
  "IBKR_SMSF_TRADE_CONFIRM_FLEX_QUERY_ID",
];

const original = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of keys) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of keys) {
    const value = original.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  original.clear();
});

test("configuredIbkrFlexSyncs keeps the legacy single-query SMSF setup working", () => {
  process.env.IBKR_FLEX_TOKEN = "shared-token";
  process.env.IBKR_FLEX_QUERY_ID = "legacy-query";

  const [config] = configuredIbkrFlexSyncs();

  assert.equal(configsLength(), 1);
  assert.ok(config);
  assert.equal(config.ownerType, "SMSF");
  assert.equal(config.token, "shared-token");
  assert.equal(config.queryId, "legacy-query");
  assert.equal(config.source, "legacy");
});

test("configuredIbkrFlexSyncs supports legacy SMSF plus Personal query", () => {
  process.env.IBKR_FLEX_TOKEN = "shared-token";
  process.env.IBKR_FLEX_QUERY_ID = "smsf-query";
  process.env.IBKR_FLEX_OWNER = "SMSF";
  process.env.IBKR_PERSONAL_FLEX_QUERY_ID = "personal-query";

  const configs = configuredIbkrFlexSyncs();

  assert.equal(configs.length, 2);
  assert.equal(ibkrFlexConfigForOwner("SMSF")?.queryId, "smsf-query");
  assert.equal(ibkrFlexConfigForOwner("PERSONAL")?.queryId, "personal-query");
  assert.equal(ibkrFlexConfigForOwner("PERSONAL")?.token, "shared-token");
});

test("owner-specific IBKR Flex token overrides the shared token", () => {
  process.env.IBKR_FLEX_TOKEN = "shared-token";
  process.env.IBKR_PERSONAL_FLEX_TOKEN = "personal-token";
  process.env.IBKR_PERSONAL_FLEX_QUERY_ID = "personal-query";

  const config = ibkrFlexConfigForOwner("PERSONAL");

  assert.equal(config?.token, "personal-token");
  assert.equal(config?.queryId, "personal-query");
});

test("owner-specific SMSF query takes priority over legacy SMSF query", () => {
  process.env.IBKR_FLEX_TOKEN = "shared-token";
  process.env.IBKR_FLEX_QUERY_ID = "legacy-smsf-query";
  process.env.IBKR_FLEX_OWNER = "SMSF";
  process.env.IBKR_SMSF_FLEX_QUERY_ID = "specific-smsf-query";

  const configs = configuredIbkrFlexSyncs();

  assert.equal(configs.length, 1);
  assert.equal(configs[0]?.ownerType, "SMSF");
  assert.equal(configs[0]?.queryId, "specific-smsf-query");
  assert.equal(configs[0]?.source, "owner-specific");
});

function configsLength() {
  return configuredIbkrFlexSyncs().length;
}

test("owner-specific IBKR Flex supports optional trade confirmation query", () => {
  process.env.IBKR_FLEX_TOKEN = "shared-token";
  process.env.IBKR_SMSF_FLEX_QUERY_ID = "activity-query";
  process.env.IBKR_SMSF_TRADE_CONFIRM_FLEX_QUERY_ID = "trade-query";

  const config = ibkrFlexConfigForOwner("SMSF");

  assert.equal(config?.queryId, "activity-query");
  assert.equal(config?.tradeConfirmQueryId, "trade-query");
});
