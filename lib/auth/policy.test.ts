import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./access";
import { basicAuthEnabled } from "./policy";

test("basicAuthEnabled is opt-in", () => {
  assert.equal(basicAuthEnabled({}), false);
  assert.equal(basicAuthEnabled({ NORTH_STAR_ALLOW_BASIC_AUTH: "false" }), false);
  assert.equal(basicAuthEnabled({ NORTH_STAR_ALLOW_BASIC_AUTH: "true" }), true);
  assert.equal(basicAuthEnabled({ NORTH_STAR_BASIC_AUTH: "true" }), true);
});

test("private app and manual API routes require a session", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api/auth/login/options"), true);
  assert.equal(isPublicPath("/api/health"), true);
  assert.equal(isPublicPath("/api/sync"), true);
  assert.equal(isPublicPath("/api/dashboard"), false);
  assert.equal(isPublicPath("/api/sync/ibkr"), false);
  assert.equal(isPublicPath("/reports/eofy"), false);
});
