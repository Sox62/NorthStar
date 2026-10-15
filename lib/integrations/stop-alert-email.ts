import type { StopAlertEmail } from "@/lib/risk/stop-alert-policy";

export function stopEmailProviderReady(env: Record<string, string | undefined> = process.env) {
  const from = env.STOP_ALERT_EMAIL_FROM?.trim() ?? "";
  return Boolean(env.RESEND_API_KEY?.trim() && /^[^\r\n]+@[^\r\n]+\.[^\r\n]+$/.test(from));
}

export async function sendStopAlertEmail(email: StopAlertEmail, idempotencyKey: string, fetcher: typeof fetch = fetch) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("The stop-alert email provider is not configured.");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(email), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Stop-alert email was not accepted (HTTP ${response.status}).`);
  const payload = await response.json() as { id?: unknown };
  if (typeof payload.id !== "string" || !payload.id) throw new Error("Stop-alert email returned no delivery reference.");
  return payload.id;
}
