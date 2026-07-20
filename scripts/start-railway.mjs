import "./check-railway-env.mjs";

const AUTO_SYNC_DISABLED = /^(0|false|no)$/i.test(process.env.NORTHSTAR_AUTO_SYNC ?? "");
const SYNC_HOUR_UTC = Number(process.env.NORTHSTAR_AUTO_SYNC_HOUR_UTC ?? 20);
const SYNC_MINUTE_UTC = Number(process.env.NORTHSTAR_AUTO_SYNC_MINUTE_UTC ?? 30);
const SYNC_TIMEOUT_MS = 90_000;
const INTRADAY_PRICE_REFRESH_SETTING = process.env.NORTHSTAR_INTRADAY_PRICE_REFRESH ?? "true";
const INTRADAY_PRICE_REFRESH_PROVIDER = process.env.NORTHSTAR_INTRADAY_PRICE_PROVIDER ?? "auto";
const INTRADAY_PRICE_REFRESH_WINDOWS_UTC = process.env.NORTHSTAR_INTRADAY_PRICE_REFRESH_WINDOWS_UTC ?? "23:00-06:30,07:30-21:30";
const INTRADAY_PRICE_REFRESH_TIMEOUT_MS = 90_000;
const INTRADAY_PRICE_REFRESH_STARTUP_DELAY_SECONDS = positiveNumber(process.env.NORTHSTAR_INTRADAY_PRICE_REFRESH_STARTUP_DELAY_SECONDS, 120, 30);
let syncInFlight = false;

function positiveNumber(value, fallback, minimum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

const INTRADAY_PRICE_REFRESH_INTERVAL_MINUTES = positiveNumber(process.env.NORTHSTAR_INTRADAY_PRICE_REFRESH_INTERVAL_MINUTES, 60, 15);

function nextRunAfter(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(SYNC_HOUR_UTC, SYNC_MINUTE_UTC, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function eodhdConfigured() {
  return Boolean(process.env.EODHD_API_TOKEN?.trim() || process.env.MARKETDATA_EODHD_API_TOKEN?.trim());
}

function intradayPriceRefreshEnabled() {
  if (/^(0|false|no)$/i.test(INTRADAY_PRICE_REFRESH_SETTING)) return false;
  if (/^(1|true|yes)$/i.test(INTRADAY_PRICE_REFRESH_SETTING)) return true;
  return eodhdConfigured();
}

function minutesUtc(now = new Date()) {
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function parseWindow(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (start < 0 || start >= 24 * 60 || end < 0 || end >= 24 * 60) return null;
  return { start, end };
}

const intradayWindows = INTRADAY_PRICE_REFRESH_WINDOWS_UTC
  .split(",")
  .map(parseWindow)
  .filter(Boolean);

function isWithinWindow(now = new Date()) {
  const minutes = minutesUtc(now);
  return intradayWindows.some((window) =>
    window.start <= window.end
      ? minutes >= window.start && minutes <= window.end
      : minutes >= window.start || minutes <= window.end
  );
}

function isWithinTradingWeek(now = new Date()) {
  const day = now.getUTCDay();
  const minutes = minutesUtc(now);
  if (day === 6) return false;
  if (day === 0) return minutes >= 22 * 60;
  return true;
}

function isIntradayPriceRefreshWindow(now = new Date()) {
  return intradayWindows.length > 0 && isWithinTradingWeek(now) && isWithinWindow(now);
}

async function runLocalSync(path, label, timeoutMs) {
  if (syncInFlight) {
    console.log(`[${label}] skipped: another sync is already running.`);
    return;
  }

  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret?.trim()) {
    console.warn(`[${label}] skipped: SYNC_SECRET is not configured.`);
    return;
  }

  syncInFlight = true;
  const port = process.env.PORT || "3000";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "x-sync-key": syncSecret },
      signal: controller.signal,
    });
    const body = await response.text();
    const summary = body.length > 1200 ? `${body.slice(0, 1200)}...` : body;
    if (!response.ok && response.status !== 207) {
      console.error(`[${label}] failed with HTTP ${response.status}: ${summary}`);
      return;
    }
    console.log(`[${label}] completed with HTTP ${response.status}: ${summary}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    console.error(`[${label}] failed: ${message}`);
  } finally {
    clearTimeout(timeout);
    syncInFlight = false;
  }
}

async function runSync() {
  await runLocalSync("/api/sync", "auto-sync", SYNC_TIMEOUT_MS);
}

async function runIntradayPriceRefresh() {
  const provider = encodeURIComponent(INTRADAY_PRICE_REFRESH_PROVIDER);
  await runLocalSync(`/api/sync?task=market-data&provider=${provider}`, "intraday-price-refresh", INTRADAY_PRICE_REFRESH_TIMEOUT_MS);
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

function scheduleIntradayPriceRefresh() {
  if (!intradayPriceRefreshEnabled()) {
    console.log("[intraday-price-refresh] disabled. Set NORTHSTAR_INTRADAY_PRICE_REFRESH=true, or configure EODHD for auto mode.");
    return;
  }

  const intervalMs = INTRADAY_PRICE_REFRESH_INTERVAL_MINUTES * 60 * 1000;
  console.log(`[intraday-price-refresh] scheduled every ${INTRADAY_PRICE_REFRESH_INTERVAL_MINUTES} minutes in UTC windows ${INTRADAY_PRICE_REFRESH_WINDOWS_UTC}.`);
  const startupTimer = setTimeout(async () => {
    if (!isIntradayPriceRefreshWindow()) return;
    await runIntradayPriceRefresh();
  }, INTRADAY_PRICE_REFRESH_STARTUP_DELAY_SECONDS * 1000);
  startupTimer.unref?.();

  const timer = setInterval(async () => {
    if (!isIntradayPriceRefreshWindow()) return;
    await runIntradayPriceRefresh();
  }, intervalMs);
  timer.unref?.();
}

scheduleNextSync();
scheduleIntradayPriceRefresh();
await import("../.next/standalone/server.js");
