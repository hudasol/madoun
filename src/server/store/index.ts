import { FileEventStore } from './file';
import { MemoryEventStore } from './memory';
import { SqliteEventStore } from './sqlite';
import type { EventStore } from './types';

export type { AppendOptions, AppendResult, EventStore, StoredEvent } from './types';
export { FileEventStore } from './file';
export { MemoryEventStore } from './memory';
export { SqliteEventStore } from './sqlite';

/**
 * Chooses the store from MADOUN_STORE:
 *   unset or `memory`      events live in this process only (the public demo)
 *   `file:<path>`          JSON Lines file, one process
 *   `sqlite:<path>`        SQLite database (Node 22.5 or later)
 */
export function openStore(spec: string | undefined = process.env.MADOUN_STORE): EventStore {
  if (!spec || spec === 'memory') return new MemoryEventStore();
  const colon = spec.indexOf(':');
  const kind = colon < 0 ? spec : spec.slice(0, colon);
  const target = colon < 0 ? '' : spec.slice(colon + 1);
  if (!target) throw new Error(`MADOUN_STORE "${spec}" needs a path, for example file:./data/events.jsonl`);
  if (kind === 'file') return new FileEventStore(target);
  if (kind === 'sqlite') return new SqliteEventStore(target);
  throw new Error(`MADOUN_STORE kind "${kind}" is not one of memory, file, sqlite`);
}
