import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NEBULA_DEFAULT_ACCENT, type ReportPayload } from '@lumora/shared';
import { config } from './config';
import { issueSignature, normalizePath, pathOf } from './lib/signature';

export type Row = Record<string, unknown>;

let db: DatabaseSync | undefined;

type Migration = string | ((database: DatabaseSync) => void);

const MIGRATIONS: Migration[] = [
  /* sql */ `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'starter',
    plan_status TEXT NOT NULL DEFAULT 'trialing',
    trial_ends_at TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    allowed_origins TEXT NOT NULL DEFAULT '[]',
    settings TEXT NOT NULL DEFAULT '{}',
    ticket_prefix TEXT NOT NULL DEFAULT 'LUM',
    ticket_counter INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE integrations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    config_enc TEXT NOT NULL,
    categories TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reference TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    reporter_email TEXT,
    payload TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    ai_summary TEXT,
    screenshot_file TEXT,
    recording_file TEXT,
    deliveries TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX tickets_project ON tickets(project_id, created_at DESC);
  CREATE TABLE usage (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    reports INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, month)
  );
  `,
  // Support Center: workflow status separate from delivery, synced from linked tickets; issue grouping.
  /* sql */ `
  ALTER TABLE tickets ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE tickets ADD COLUMN external_status TEXT;
  ALTER TABLE tickets ADD COLUMN fingerprint TEXT;
  ALTER TABLE tickets ADD COLUMN issue_label TEXT;
  ALTER TABLE tickets ADD COLUMN page_path TEXT;
  ALTER TABLE tickets ADD COLUMN browser TEXT;
  ALTER TABLE tickets ADD COLUMN os TEXT;
  ALTER TABLE tickets ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tickets ADD COLUMN synced_at TEXT;
  ALTER TABLE tickets ADD COLUMN resolved_at TEXT;
  UPDATE tickets SET delivery_status = CASE status WHEN 'forwarded' THEN 'sent' WHEN 'delivery_failed' THEN 'failed' ELSE 'pending' END;
  UPDATE tickets SET status = CASE status WHEN 'resolved' THEN 'resolved' ELSE 'open' END;
  CREATE INDEX tickets_status ON tickets(project_id, status, created_at DESC);
  CREATE INDEX tickets_fingerprint ON tickets(project_id, fingerprint);
  ALTER TABLE integrations ADD COLUMN hook_token TEXT;
  `,
  (database) => {
    // Backfill grouping and facets for reports created before the Support Center existed.
    const rows = database.prepare('SELECT id, payload, category FROM tickets').all() as { id: string; payload: string; category: string | null }[];
    const update = database.prepare('UPDATE tickets SET fingerprint = ?, issue_label = ?, page_path = ?, browser = ?, os = ?, error_count = ? WHERE id = ?');
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as ReportPayload;
      const sig = issueSignature(payload, row.category);
      const env = payload.environment;
      update.run(
        sig.fingerprint,
        sig.label,
        env?.url ? normalizePath(pathOf(env.url)) : null,
        env?.browser ?? null,
        env?.os ?? null,
        payload.console?.filter((e) => e.level === 'error').length ?? 0,
        row.id,
      );
    }
  },
  /* sql */ `
  ALTER TABLE accounts ADD COLUMN addons TEXT NOT NULL DEFAULT '{}';
  UPDATE accounts SET plan = 'free' WHERE plan = 'starter';
  ALTER TABLE usage ADD COLUMN ai_reports INTEGER NOT NULL DEFAULT 0;
  `,
  /* sql */ `
  ALTER TABLE tickets ADD COLUMN ai_data TEXT;
  ALTER TABLE tickets ADD COLUMN transcript TEXT;
  `,
  (database) => {
    // Projects still on an earlier default color move to the new pastel yellow.
    const rows = database.prepare('SELECT id, settings FROM projects').all() as { id: string; settings: string }[];
    const update = database.prepare('UPDATE projects SET settings = ? WHERE id = ?');
    for (const row of rows) {
      const settings = JSON.parse(row.settings || '{}');
      const accent = String(settings?.appearance?.accentColor ?? '').toUpperCase();
      if (accent === '#F59E0B' || accent === '#F4C152') {
        settings.appearance.accentColor = NEBULA_DEFAULT_ACCENT;
        update.run(JSON.stringify(settings), row.id);
      }
    }
  },
  // Onboarding: install detection, first report, per-account onboarding state, password reset,
  // status-webhook health.
  /* sql */ `
  ALTER TABLE projects ADD COLUMN installed_at TEXT;
  ALTER TABLE projects ADD COLUMN installed_origin TEXT;
  ALTER TABLE projects ADD COLUMN first_report_at TEXT;
  ALTER TABLE accounts ADD COLUMN onboarding TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE users ADD COLUMN reset_token_hash TEXT;
  ALTER TABLE users ADD COLUMN reset_expires_at TEXT;
  ALTER TABLE integrations ADD COLUMN last_hook_at TEXT;
  ALTER TABLE integrations ADD COLUMN remote_hook_id TEXT;
  UPDATE projects SET first_report_at = (SELECT MIN(created_at) FROM tickets t WHERE t.project_id = projects.id);
  UPDATE accounts SET onboarding = '{"setupDone":true,"tourDone":true}';
  `,
  // Support Center 2: priority, the assignee from the linked tool, saved views.
  /* sql */ `
  ALTER TABLE tickets ADD COLUMN priority TEXT;
  ALTER TABLE tickets ADD COLUMN assignee_name TEXT;
  ALTER TABLE tickets ADD COLUMN assignee_email TEXT;
  UPDATE tickets SET priority = json_extract(ai_data, '$.priority') WHERE ai_data IS NOT NULL;
  CREATE TABLE saved_views (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    layout TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(process.env.LUMORA_DB === ':memory:' ? ':memory:' : path.join(config.dataDir, 'lumora.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync): void {
  const { user_version: version } = database.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let i = version; i < MIGRATIONS.length; i++) {
    database.exec('BEGIN');
    try {
      const migration = MIGRATIONS[i];
      if (typeof migration === 'string') database.exec(migration);
      else migration(database);
      database.exec(`PRAGMA user_version = ${i + 1}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

type Param = string | number | null | bigint | Uint8Array;

export function one<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Param[]): { changes: number } {
  const result = getDb().prepare(sql).run(...params);
  return { changes: Number(result.changes) };
}

export function transaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
