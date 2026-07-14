import { LocalStorageAdapter } from "./local";
import { PostgresStorageAdapter } from "./postgres";
import type { StorageAdapter } from "./types";

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (!adapter) adapter = process.env.DATABASE_URL ? new PostgresStorageAdapter() : new LocalStorageAdapter();
  return adapter;
}

export * from "./types";
