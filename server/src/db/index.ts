import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config";
import { MIGRATIONS } from "./migrations";

export type DB = Database.Database;

let db: DB | null = null;

/** Open a database and bring its schema up to date. ":memory:" for tests. */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  migrate(conn);
  return conn;
}

function migrate(conn: DB) {
  const current = conn.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[i]);
      conn.pragma(`user_version = ${i + 1}`);
    })();
  }
}

/** The app-wide connection (opened lazily). */
export function getDb(): DB {
  if (!db) db = openDb(path.join(config.dataDir, "spoolkeeper.db"));
  return db;
}

/** Swap the app-wide connection - tests only. */
export function setDb(conn: DB) {
  db = conn;
}
