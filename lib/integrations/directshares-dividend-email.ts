import { ImapFlow, type FetchMessageObject, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { parseDirectsharesDividendText } from "./dividends";
import type { ImportedTransaction } from "./types";

export type DirectsharesDividendEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  from: string;
  subject: string;
  days: number;
  maxMessages: number;
  gmailRaw?: string;
};

export type DirectsharesDividendEmailFetchResult = {
  source: "Directshares Dividends";
  mailbox: string;
  messages: number;
  parsed: number;
  skipped: number;
  errors: string[];
  transactions: ImportedTransaction[];
};

function envValue(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() || undefined;
}

function envNumber(env: NodeJS.ProcessEnv, key: string, fallback: number) {
  const parsed = Number(envValue(env, key));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean) {
  const value = envValue(env, key);
  if (!value) return fallback;
  return /^(1|true|yes)$/i.test(value);
}

function dividendEnv(env: NodeJS.ProcessEnv, key: string) {
  return envValue(env, `DIRECTSHARES_DIVIDEND_EMAIL_${key}`) || envValue(env, `DIRECTSHARES_EMAIL_${key}`);
}

export function hasDirectsharesDividendEmailConfig(env = process.env) {
  return Boolean(dividendEnv(env, "HOST") && dividendEnv(env, "USER") && dividendEnv(env, "PASSWORD"));
}

export function directsharesDividendEmailConfigFromEnv(env = process.env): DirectsharesDividendEmailConfig {
  const host = dividendEnv(env, "HOST");
  const user = dividendEnv(env, "USER");
  const password = dividendEnv(env, "PASSWORD");
  if (!host || !user || !password) {
    throw new Error("Directshares dividend email sync is not configured. Set DIRECTSHARES_DIVIDEND_EMAIL_HOST, USER and PASSWORD, or reuse DIRECTSHARES_EMAIL_* credentials.");
  }

  return {
    host,
    port: envNumber(env, "DIRECTSHARES_DIVIDEND_EMAIL_PORT", envNumber(env, "DIRECTSHARES_EMAIL_PORT", 993)),
    secure: envBoolean(env, "DIRECTSHARES_DIVIDEND_EMAIL_SECURE", envBoolean(env, "DIRECTSHARES_EMAIL_SECURE", true)),
    user,
    password,
    mailbox: envValue(env, "DIRECTSHARES_DIVIDEND_EMAIL_MAILBOX") || envValue(env, "DIRECTSHARES_EMAIL_MAILBOX") || "INBOX",
    from: envValue(env, "DIRECTSHARES_DIVIDEND_EMAIL_FROM") || envValue(env, "DIRECTSHARES_EMAIL_FROM") || "service@directshares.com.au",
    subject: envValue(env, "DIRECTSHARES_DIVIDEND_EMAIL_SUBJECT") || "Dividend",
    days: envNumber(env, "DIRECTSHARES_DIVIDEND_EMAIL_LOOKBACK_DAYS", envNumber(env, "DIRECTSHARES_EMAIL_LOOKBACK_DAYS", 90)),
    maxMessages: envNumber(env, "DIRECTSHARES_DIVIDEND_EMAIL_MAX_MESSAGES", 50),
    gmailRaw: envValue(env, "DIRECTSHARES_DIVIDEND_EMAIL_GMAIL_RAW"),
  };
}

function searchCriteria(config: DirectsharesDividendEmailConfig): SearchObject {
  if (config.gmailRaw) return { gmraw: config.gmailRaw };
  const since = new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
  return { since, from: config.from, subject: config.subject };
}

function messageFrom(message: FetchMessageObject) {
  return message.envelope?.from?.map((address) => address.address || "").join(" ").toLowerCase() || "";
}

function messageDate(message: FetchMessageObject) {
  const value = message.internalDate || message.envelope?.date;
  return value ? new Date(value) : null;
}

function matchesLocalFilters(message: FetchMessageObject, config: DirectsharesDividendEmailConfig, since: Date) {
  const subject = message.envelope?.subject || "";
  const from = messageFrom(message);
  const date = messageDate(message);
  return subject.toLowerCase().includes(config.subject.toLowerCase())
    && (!config.from || from.includes(config.from.toLowerCase()))
    && (!date || date >= since);
}

async function matchingUids(client: ImapFlow, config: DirectsharesDividendEmailConfig) {
  try {
    const uids = await client.search(searchCriteria(config), { uid: true });
    return Array.isArray(uids) ? uids.slice(-config.maxMessages) : [];
  } catch {
    // Some Gmail label/mailbox combinations reject IMAP SEARCH. Fetch a bounded recent slice and filter locally.
  }

  const since = new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
  const matches: number[] = [];
  for await (const message of client.fetch("1:*", { uid: true, envelope: true, internalDate: true })) {
    if (matchesLocalFilters(message, config, since)) matches.push(message.uid);
  }
  return matches.slice(-config.maxMessages);
}

function stripHtml(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ");
}

export async function fetchDirectsharesDividendEmailTransactions(config = directsharesDividendEmailConfigFromEnv()): Promise<DirectsharesDividendEmailFetchResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    clientInfo: { name: "NorthStar" },
  });

  const result: DirectsharesDividendEmailFetchResult = {
    source: "Directshares Dividends",
    mailbox: config.mailbox,
    messages: 0,
    parsed: 0,
    skipped: 0,
    errors: [],
    transactions: [],
  };

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const uidList = await matchingUids(client, config);
      if (!uidList.length) return result;

      for await (const message of client.fetch(uidList, { uid: true, envelope: true, source: true }, { uid: true })) {
        result.messages += 1;
        const subject = message.envelope?.subject || "";
        if (!message.source || !subject.toLowerCase().includes(config.subject.toLowerCase())) {
          result.skipped += 1;
          continue;
        }

        try {
          const parsed = await simpleParser(message.source);
          const body = parsed.text || stripHtml(String(parsed.html || ""));
          const transaction = parseDirectsharesDividendText(body, subject);
          result.transactions.push(transaction);
          result.parsed += 1;
        } catch (error) {
          result.errors.push(`message ${message.uid}: ${error instanceof Error ? error.message : "Unable to parse Directshares dividend email."}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return result;
}
