import fs from 'node:fs';
import path from 'node:path';
import type { MadounEvent } from '@/engine';
import type { AppendOptions, AppendResult, EventStore, StoredEvent } from './types';

/**
 * Events in a JSON Lines file: one `{"seq":1,"event":{...}}` object per line, appended and
 * flushed to disk before the call returns. Intended for a single server process on a local disk. It is
 * not safe for several writers. A torn last line (a crash in the middle of a write) is ignored on open
 * and overwritten by the next append, because the log is only valid up to the last complete line.
 */
export class FileEventStore implements EventStore {
  readonly kind = 'file' as const;
  private rows: StoredEvent[] = [];
  private keys = new Map<string, number[]>();
  private fd: number;
  /** Bytes of the file that hold complete lines. */
  private size = 0;

  constructor(readonly file: string) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.closeSync(fs.openSync(file, 'a')); // create it if missing
    this.fd = fs.openSync(file, 'r+'); // positioned writes, so a failed write cannot leave the offset wrong
    this.load();
  }

  private load(): void {
    const text = fs.readFileSync(this.file, 'utf8');
    const end = text.lastIndexOf('\n') + 1;
    for (const line of text.slice(0, end).split('\n')) {
      if (!line) continue;
      let row: StoredEvent;
      try {
        row = JSON.parse(line) as StoredEvent;
      } catch {
        throw new Error(`event log ${this.file} is corrupt at event ${this.rows.length + 1}`);
      }
      if (row.seq !== this.rows.length + 1) throw new Error(`event log ${this.file} has a gap or repeat at event ${this.rows.length + 1}`);
      this.rows.push(row);
      if (row.key !== undefined) this.keys.set(row.key, Array.from({ length: row.count ?? 1 }, (_, i) => row.seq + i));
    }
    this.size = Buffer.byteLength(text.slice(0, end), 'utf8');
    if (end < text.length) fs.truncateSync(this.file, this.size);
  }

  version(): number {
    return this.rows.length;
  }

  append(events: readonly MadounEvent[], options: AppendOptions = {}): AppendResult {
    const { expectedVersion, idempotencyKey } = options;
    if (idempotencyKey !== undefined) {
      const seen = this.keys.get(idempotencyKey);
      if (seen) return { ok: true, seqs: seen, version: this.rows.length, duplicate: true };
    }
    if (expectedVersion !== undefined && expectedVersion !== this.rows.length) {
      return { ok: false, reason: 'version_conflict', version: this.rows.length };
    }
    const seqs = events.map((_, i) => this.rows.length + i + 1);
    const added: StoredEvent[] = events.map((event, i) => ({ seq: seqs[i], ...(i === 0 && idempotencyKey !== undefined ? { key: idempotencyKey, count: events.length } : {}), event }));
    const data = Buffer.from(added.map((r) => JSON.stringify(r) + '\n').join(''), 'utf8');
    try {
      fs.writeSync(this.fd, data, 0, data.length, this.size);
      fs.fsyncSync(this.fd);
    } catch (e) {
      // Cut off whatever part of the batch reached the disk, so the log still ends on a complete line.
      try { fs.ftruncateSync(this.fd, this.size); } catch { /* the next open ignores a torn last line */ }
      throw e;
    }
    this.size += data.length;
    this.rows.push(...added);
    if (idempotencyKey !== undefined) this.keys.set(idempotencyKey, seqs);
    return { ok: true, seqs, version: this.rows.length, duplicate: false };
  }

  read(after = 0): StoredEvent[] {
    return this.rows.slice(after);
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}
