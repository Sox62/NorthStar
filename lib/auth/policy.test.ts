import assert from "node:assert/strict";
import test from "node:test";
import { basicAuthEnabled } from "./policy";

test("basicAuthEnabled is opt-in", () => {
  assert.equal(basicAuthEnabled({}), false);
  assert.equal(basicAuthEnabled({ NORTH_STAR_ALLOW_BASIC_AUTH: "false" }), false);
  assert.equal(basicAuthEnabled({ NORTH_STAR_ALLOW_BASIC_AUTH: "true" }), true);
  assert.equal(basicAuthEnabled({ NORTH_STAR_BASIC_AUTH: "true" }), true);
});
