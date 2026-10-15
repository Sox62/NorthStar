import assert from "node:assert/strict";
import test from "node:test";
import { sendStopAlertEmail, stopEmailProviderReady } from "./stop-alert-email";

test("email provider requires an API key and a sender address", () => {
  assert.equal(stopEmailProviderReady({}), false);
  assert.equal(stopEmailProviderReady({ RESEND_API_KEY: "key", STOP_ALERT_EMAIL_FROM: "SS <alerts@example.com>" }), true);
  assert.equal(stopEmailProviderReady({ RESEND_API_KEY: "key", STOP_ALERT_EMAIL_FROM: "bad\r\naddress@example.com" }), false);
});

test("outgoing email uses idempotency and only marks accepted responses successful", async () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "unit-test-only";
  const email = { from: "alerts@example.com", to: ["test@example.com"], subject: "Stop", text: "test" };
  try {
    const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal((options?.headers as Record<string, string>)["Idempotency-Key"], "stable-key");
      assert.equal(options?.body, JSON.stringify(email));
      return Response.json({ id: "accepted" });
    }) as typeof fetch;
    assert.equal(await sendStopAlertEmail(email, "stable-key", fetcher), "accepted");
    await assert.rejects(sendStopAlertEmail(email, "stable-key", (async () => Response.json({ error: "rejected" }, { status: 429 })) as typeof fetch), /HTTP 429/);
    await assert.rejects(sendStopAlertEmail(email, "stable-key", (async () => Response.json({})) as typeof fetch), /no delivery reference/);
  } finally { if (previous === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previous; }
});
