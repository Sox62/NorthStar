import "./check-railway-env.mjs";

const AUTO_SYNC_DISABLED = /^(0|false|no)$/i.test(process.env.NORTHSTAR_AUTO_SYNC ?? "");
const SYNC_HOUR_UTC = Number(process.env.NORTHSTAR_AUTO_SYNC_HOUR_UTC ?? 20);
const SYNC_MINUTE_UTC = Number(process.env.NORTHSTAR_AUTO_SYNC_MINUTE_UTC ?? 30);
const SYNC_TIMEOUT_MS = 90_000;

function nextRunAfter(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(SYNC_HOUR_UTC, SYNC_MINUTE_UTC, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function runSync() {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret?.trim()) {
    console.warn("[auto-sync] skipped: SYNC_SECRET is not configured.");
    return;
  }

  const port = process.env.PORT || "3000";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      method: "POST",
      headers: { "x-sync-key": syncSecret },
      signal: controller.signal,
    });
    const body = await response.text();
    const summary = body.length > 1200 ? `${body.slice(0, 1200)}...` : body;
    if (!response.ok && response.status !== 207) {
      console.error(`[auto-sync] failed with HTTP ${response.status}: ${summary}`);
      return;
    }
    console.log(`[auto-sync] completed with HTTP ${response.status}: ${summary}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    console.error(`[auto-sync] failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleNextSync() {
  if (AUTO_SYNC_DISABLED) {
    console.log("[auto-sync] disabled by NORTHSTAR_AUTO_SYNC.");
    return;
  }

  const next = nextRunAfter();
  const delay = Math.max(0, next.getTime() - Date.now());
  console.log(`[auto-sync] next run scheduled for ${next.toISOString()}.`);
  const timer = setTimeout(async () => {
    await runSync();
    scheduleNextSync();
  }, delay);
  timer.unref?.();
}

scheduleNextSync();
await import("../.next/standalone/server.js");
