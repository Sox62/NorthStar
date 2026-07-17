import { ImapFlow, type FetchMessageObject, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { parseDirectsharesConfirmationPdf } from "./directshares";
import type { ImportedTransaction } from "./types";

export type DirectsharesEmailConfig = {
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

export type DirectsharesEmailFetchResult = {
  source: "Directshares Email";
  mailbox: string;
  messages: number;
  attachments: number;
  parsed: number;
  skipped: number;
  errors: string[];
  transactions: ImportedTransaction[];
};

const DEFAULT_FROM = "service@directshares.com.au";
const DEFAULT_SUBJECT = "Trade Confirmation";

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

export function hasDirectsharesEmailConfig(env = process.env) {
  return Boolean(envValue(env, "DIRECTSHARES_EMAIL_HOST") && envValue(env, "DIRECTSHARES_EMAIL_USER") && envValue(env, "DIRECTSHARES_EMAIL_PASSWORD"));
}

export function directsharesEmailConfigFromEnv(env = process.env): DirectsharesEmailConfig {
  const host = envValue(env, "DIRECTSHARES_EMAIL_HOST");
  const user = envValue(env, "DIRECTSHARES_EMAIL_USER");
  const password = envValue(env, "DIRECTSHARES_EMAIL_PASSWORD");
  if (!host || !user || !password) {
    throw new Error("Directshares email sync is not configured. Set DIRECTSHARES_EMAIL_HOST, DIRECTSHARES_EMAIL_USER and DIRECTSHARES_EMAIL_PASSWORD.");
  }

  return {
    host,
    port: envNumber(env, "DIRECTSHARES_EMAIL_PORT", 993),
    secure: envBoolean(env, "DIRECTSHARES_EMAIL_SECURE", true),
    user,
    password,
    mailbox: envValue(env, "DIRECTSHARES_EMAIL_MAILBOX") || "INBOX",
    from: envValue(env, "DIRECTSHARES_EMAIL_FROM") || DEFAULT_FROM,
    subject: envValue(env, "DIRECTSHARES_EMAIL_SUBJECT") || DEFAULT_SUBJECT,
    days: envNumber(env, "DIRECTSHARES_EMAIL_LOOKBACK_DAYS", 45),
    maxMessages: envNumber(env, "DIRECTSHARES_EMAIL_MAX_MESSAGES", 50),
    gmailRaw: envValue(env, "DIRECTSHARES_EMAIL_GMAIL_RAW"),
  };
}

function subjectLooksLikeConfirmation(subject: string, config: DirectsharesEmailConfig) {
  return subject.toLowerCase().includes(config.subject.toLowerCase()) && /A\/C:/i.test(subject);
}

function isPdfAttachment(filename: string, contentType: string) {
  return /\.pdf$/i.test(filename) || /pdf|octet-stream/i.test(contentType);
}

function searchCriteria(config: DirectsharesEmailConfig): SearchObject {
  if (config.gmailRaw) return { gmraw: config.gmailRaw };
  const since = new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
  return {
    since,
    from: config.from,
    subject: config.subject,
  };
}

function messageFrom(message: FetchMessageObject) {
  return message.envelope?.from?.map((address) => address.address || "").join(" ").toLowerCase() || "";
}

function messageDate(message: FetchMessageObject) {
  const value = message.internalDate || message.envelope?.date;
  return value ? new Date(value) : null;
}

function matchesLocalFilters(message: FetchMessageObject, config: DirectsharesEmailConfig, since: Date) {
  const subject = message.envelope?.subject || "";
  const from = messageFrom(message);
  const date = messageDate(message);
  return subject.toLowerCase().includes(config.subject.toLowerCase())
    && (!config.from || from.includes(config.from.toLowerCase()))
    && (!date || date >= since);
}

async function matchingUids(client: ImapFlow, config: DirectsharesEmailConfig) {
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

export async function fetchDirectsharesEmailTransactions(config = directsharesEmailConfigFromEnv()): Promise<DirectsharesEmailFetchResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    clientInfo: { name: "NorthStar" },
  });

  const result: DirectsharesEmailFetchResult = {
    source: "Directshares Email",
    mailbox: config.mailbox,
    messages: 0,
    attachments: 0,
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
        if (!message.source || !subjectLooksLikeConfirmation(subject, config)) {
          result.skipped += 1;
          continue;
        }

        try {
          const parsed = await simpleParser(message.source);
          for (const attachment of parsed.attachments) {
            const filename = attachment.filename || "";
            if (!isPdfAttachment(filename, attachment.contentType || "")) {
              result.skipped += 1;
              continue;
            }

            result.attachments += 1;
            try {
              const transaction = await parseDirectsharesConfirmationPdf(attachment.content);
              result.transactions.push(transaction);
              result.parsed += 1;
            } catch (error) {
              result.errors.push(`${filename || `message ${message.uid}`}: ${error instanceof Error ? error.message : "Unable to parse Directshares confirmation."}`);
            }
          }
        } catch (error) {
          result.errors.push(`message ${message.uid}: ${error instanceof Error ? error.message : "Unable to parse email message."}`);
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
