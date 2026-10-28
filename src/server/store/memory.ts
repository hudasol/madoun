import type { MadounEvent } from '@/engine';
import type { AppendOptions, AppendResult, EventStore, StoredEvent } from './types';

/** Events held in this process only. The default; lost on restart. */
export class MemoryEventStore implements EventStore {
  readonly kind = 'memory' as const;
  private rows: StoredEvent[] = [];
  private keys = new Map<string, number[]>();

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
    events.forEach((event, i) => this.rows.push({ seq: seqs[i], ...(i === 0 && idempotencyKey !== undefined ? { key: idempotencyKey, count: events.length } : {}), event }));
    if (idempotencyKey !== undefined) this.keys.set(idempotencyKey, seqs);
    return { ok: true, seqs, version: this.rows.length, duplicate: false };
  }

  read(after = 0): StoredEvent[] {
    return this.rows.slice(after);
  }

  close(): void {}
}
