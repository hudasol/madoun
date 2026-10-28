import type { DatabaseSync } from 'node:sqlite';
import type { MadounEvent } from '@/engine';
import type { AppendOptions, AppendResult, EventStore, StoredEvent } from './types';

/**
 * Events in a SQLite database (node:sqlite, built into Node 22.5 and later, still flagged experimental
 * by Node). Write ahead logging, one transaction per append, so a batch is stored whole or not at all.
 * Several processes on one machine may share the file; SQLite serialises their writers and the
 * expected version check runs inside the transaction. For several machines use a networked database.
 */
export class SqliteEventStore implements EventStore {
  readonly kind = 'sqlite' as const;
  private db: DatabaseSync;

  constructor(readonly file: string) {
    // Loaded here, not at the top, so that importing this file never loads the experimental module and
    // a bundler has nothing to resolve. getBuiltinModule needs Node 22.3 or later.
    const sqlite = process.getBuiltinModule?.('node:sqlite') as typeof import('node:sqlite') | undefined;
    if (!sqlite) throw new Error('MADOUN_STORE=sqlite needs Node 22.5 or later (node:sqlite)');
    this.db = new sqlite.DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY,
      key TEXT UNIQUE,
      count INTEGER,
      body TEXT NOT NULL
    ) STRICT`);
  }

  version(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS v FROM events').get() as { v: number };
    return row.v;
  }

  append(events: readonly MadounEvent[], options: AppendOptions = {}): AppendResult {
    const { expectedVersion, idempotencyKey } = options;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (idempotencyKey !== undefined) {
        const seen = this.db.prepare('SELECT seq, count FROM events WHERE key = ?').get(idempotencyKey) as { seq: number; count: number } | undefined;
        if (seen) {
          this.db.exec('ROLLBACK');
          return { ok: true, seqs: Array.from({ length: seen.count }, (_, i) => seen.seq + i), version: this.version(), duplicate: true };
        }
      }
      const current = this.version();
      if (expectedVersion !== undefined && expectedVersion !== current) {
        this.db.exec('ROLLBACK');
        return { ok: false, reason: 'version_conflict', version: current };
      }
      const insert = this.db.prepare('INSERT INTO events (seq, key, count, body) VALUES (?, ?, ?, ?)');
      const seqs = events.map((event, i) => {
        const seq = current + i + 1;
        insert.run(seq, i === 0 && idempotencyKey !== undefined ? idempotencyKey : null, i === 0 && idempotencyKey !== undefined ? events.length : null, JSON.stringify(event));
        return seq;
      });
      this.db.exec('COMMIT');
      return { ok: true, seqs, version: current + events.length, duplicate: false };
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    }
  }

  read(after = 0): StoredEvent[] {
    const rows = this.db.prepare('SELECT seq, key, count, body FROM events WHERE seq > ? ORDER BY seq').all(after) as { seq: number; key: string | null; count: number | null; body: string }[];
    return rows.map((r) => ({ seq: r.seq, ...(r.key !== null ? { key: r.key, count: r.count ?? 1 } : {}), event: JSON.parse(r.body) as MadounEvent }));
  }

  close(): void {
    this.db.close();
  }
}
