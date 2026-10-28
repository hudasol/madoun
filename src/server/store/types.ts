import type { MadounEvent } from '@/engine';

/** One stored event with its position in the store (1 based, gapless). */
export interface StoredEvent {
  seq: number;
  /** Caller chosen key that makes an append safe to retry. */
  key?: string;
  /** On the first row of a keyed append: how many events that append stored. */
  count?: number;
  event: MadounEvent;
}

export interface AppendOptions {
  /** Refuse the append unless the store holds exactly this many events (optimistic concurrency). */
  expectedVersion?: number;
  /** A second append with the same key stores nothing and reports the first one's positions. */
  idempotencyKey?: string;
}

export type AppendResult =
  | { ok: true; /** Positions of the stored events. */ seqs: number[]; version: number; duplicate: boolean }
  | { ok: false; reason: 'version_conflict'; version: number };

/**
 * The durable log the inspection gateway writes to. Append only and ordered; a batch is stored whole
 * or not at all. Implementations are synchronous: the sqlite and file adapters use synchronous node
 * calls, which keeps the API handlers simple and the ordering obvious.
 */
export interface EventStore {
  readonly kind: 'memory' | 'file' | 'sqlite';
  /** Number of stored events. */
  version(): number;
  append(events: readonly MadounEvent[], options?: AppendOptions): AppendResult;
  /** Events with `seq` greater than `after`, in order. */
  read(after?: number): StoredEvent[];
  close(): void;
}
