import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { getPool } from "@/lib/db/client";
import { randomBase64Url } from "./base64url";

export type AuthUser = {
  id: string;
  username: string;
  webauthnUserId: string;
  displayName: string;
};

export type AuthPasskey = {
  id: string;
  userId: string;
  username: string;
  publicKey: string;
  counter: number;
  deviceType: string | null;
  backedUp: boolean;
  transports: AuthenticatorTransportFuture[];
};

type ChallengeKind = "registration" | "authentication";
type AuthChallenge = {
  id: string;
  username: string | null;
  kind: ChallengeKind;
  challenge: string;
  expiresAt: string;
  createdAt: string;
};

type AuthLocalStore = {
  version: 1;
  users: AuthUser[];
  passkeys: AuthPasskey[];
  challenges: AuthChallenge[];
};

type PgAuthUserRow = {
  id: string;
  username: string;
  webauthn_user_id: string;
  display_name: string;
};

type PgPasskeyRow = {
  id: string;
  user_id: string;
  username: string;
  public_key: string;
  counter: number | string;
  device_type: string | null;
  backed_up: boolean;
  transports: AuthenticatorTransportFuture[] | null;
};

const AUTH_FILE = process.env.NORTH_STAR_AUTH_FILE || path.join(process.cwd(), ".north-star", "auth.json");
const EMPTY: AuthLocalStore = { version: 1, users: [], passkeys: [], challenges: [] };

function isExpired(challenge: AuthChallenge) {
  return new Date(challenge.expiresAt).getTime() <= Date.now();
}

async function readLocalStore(): Promise<AuthLocalStore> {
  try {
    const store = JSON.parse(await readFile(AUTH_FILE, "utf8")) as AuthLocalStore;
    return { ...EMPTY, ...store, challenges: (store.challenges ?? []).filter((challenge) => !isExpired(challenge)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

async function writeLocalStore(store: AuthLocalStore) {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  const temp = `${AUTH_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2));
  await rename(temp, AUTH_FILE);
}

export class AuthStore {
  private get isPostgres() {
    return Boolean(process.env.DATABASE_URL);
  }

  async getOrCreateUser(username: string, displayName = username): Promise<AuthUser> {
    if (this.isPostgres) {
      const result = await getPool().query<PgAuthUserRow>(`
        INSERT INTO auth_users (username, webauthn_user_id, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now()
        RETURNING id, username, webauthn_user_id, display_name
      `, [username, randomBase64Url(), displayName]);
      const row = result.rows[0];
      return { id: row.id, username: row.username, webauthnUserId: row.webauthn_user_id, displayName: row.display_name };
    }

    const store = await readLocalStore();
    let user = store.users.find((item) => item.username === username);
    if (!user) {
      user = { id: randomUUID(), username, webauthnUserId: randomBase64Url(), displayName };
      store.users.push(user);
    } else {
      user.displayName = displayName;
    }
    await writeLocalStore(store);
    return user;
  }

  async getUser(username: string): Promise<AuthUser | null> {
    if (this.isPostgres) {
      const result = await getPool().query<PgAuthUserRow>(
        "SELECT id, username, webauthn_user_id, display_name FROM auth_users WHERE username=$1",
        [username],
      );
      const row = result.rows[0];
      return row ? { id: row.id, username: row.username, webauthnUserId: row.webauthn_user_id, displayName: row.display_name } : null;
    }
    const store = await readLocalStore();
    return store.users.find((item) => item.username === username) ?? null;
  }

  async listPasskeys(username?: string): Promise<AuthPasskey[]> {
    if (this.isPostgres) {
      const values: unknown[] = [];
      const filter = username ? "WHERE au.username=$1" : "";
      if (username) values.push(username);
      const result = await getPool().query<PgPasskeyRow>(`
        SELECT ap.id, ap.user_id, au.username, ap.public_key, ap.counter, ap.device_type, ap.backed_up, ap.transports
        FROM auth_passkeys ap JOIN auth_users au ON au.id=ap.user_id ${filter}
        ORDER BY ap.created_at DESC
      `, values);
      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        publicKey: row.public_key,
        counter: Number(row.counter),
        deviceType: row.device_type,
        backedUp: row.backed_up,
        transports: row.transports ?? [],
      }));
    }
    const store = await readLocalStore();
    return username ? store.passkeys.filter((item) => item.username === username) : store.passkeys;
  }

  async getPasskey(id: string): Promise<AuthPasskey | null> {
    const passkeys = await this.listPasskeys();
    return passkeys.find((item) => item.id === id) ?? null;
  }

  async savePasskey(input: Omit<AuthPasskey, "username">) {
    if (this.isPostgres) {
      await getPool().query(`
        INSERT INTO auth_passkeys (id, user_id, public_key, counter, device_type, backed_up, transports)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          public_key=EXCLUDED.public_key,
          counter=EXCLUDED.counter,
          device_type=EXCLUDED.device_type,
          backed_up=EXCLUDED.backed_up,
          transports=EXCLUDED.transports
      `, [input.id, input.userId, input.publicKey, input.counter, input.deviceType, input.backedUp, JSON.stringify(input.transports)]);
      return;
    }
    const store = await readLocalStore();
    const user = store.users.find((item) => item.id === input.userId);
    if (!user) throw new Error("Auth user was not found.");
    store.passkeys = store.passkeys.filter((item) => item.id !== input.id);
    store.passkeys.push({ ...input, username: user.username });
    await writeLocalStore(store);
  }

  async updatePasskeyCounter(id: string, counter: number) {
    if (this.isPostgres) {
      await getPool().query("UPDATE auth_passkeys SET counter=$2, last_used_at=now() WHERE id=$1", [id, counter]);
      return;
    }
    const store = await readLocalStore();
    store.passkeys = store.passkeys.map((item) => item.id === id ? { ...item, counter } : item);
    await writeLocalStore(store);
  }

  async saveChallenge(kind: ChallengeKind, challenge: string, username?: string | null) {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    if (this.isPostgres) {
      await getPool().query("DELETE FROM auth_challenges WHERE expires_at <= now()");
      await getPool().query(
        "INSERT INTO auth_challenges (username, kind, challenge, expires_at) VALUES ($1, $2, $3, $4)",
        [username ?? null, kind, challenge, expiresAt],
      );
      return;
    }
    const store = await readLocalStore();
    store.challenges.push({ id: randomUUID(), username: username ?? null, kind, challenge, expiresAt, createdAt: new Date().toISOString() });
    await writeLocalStore(store);
  }

  async getChallenge(kind: ChallengeKind, challenge: string, username?: string | null) {
    if (this.isPostgres) {
      const result = await getPool().query<AuthChallenge>(`
        SELECT id, username, kind, challenge, expires_at::text AS "expiresAt", created_at::text AS "createdAt"
        FROM auth_challenges
        WHERE kind=$1 AND challenge=$2 AND ($3::text IS NULL OR username=$3) AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
      `, [kind, challenge, username ?? null]);
      return result.rows[0] ?? null;
    }
    const store = await readLocalStore();
    return store.challenges.find((item) =>
      item.kind === kind
      && item.challenge === challenge
      && !isExpired(item)
      && (username == null || item.username === username)
    ) ?? null;
  }

  async latestChallenge(kind: ChallengeKind, username: string) {
    if (this.isPostgres) {
      const result = await getPool().query<AuthChallenge>(`
        SELECT id, username, kind, challenge, expires_at::text AS "expiresAt", created_at::text AS "createdAt"
        FROM auth_challenges
        WHERE kind=$1 AND username=$2 AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
      `, [kind, username]);
      return result.rows[0] ?? null;
    }
    const store = await readLocalStore();
    return store.challenges
      .filter((item) => item.kind === kind && item.username === username && !isExpired(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async consumeChallenge(id: string) {
    if (this.isPostgres) {
      await getPool().query("DELETE FROM auth_challenges WHERE id=$1", [id]);
      return;
    }
    const store = await readLocalStore();
    store.challenges = store.challenges.filter((item) => item.id !== id);
    await writeLocalStore(store);
  }
}

export function getAuthStore() {
  return new AuthStore();
}
