import { generate, type Generated } from '@/data/generate';
import {
  computeKpis, detectExceptions, ms, replay, simulate,
  type ExceptionItem, type Kpis, type SimOutput, type World,
} from '@/engine';

export interface ApiWorld {
  g: Generated;
  sim: SimOutput;
  world: World;
  /** Snapshot time: the generator's "now". The API never reads the system clock. */
  now: string;
  kpis: Kpis;
  exceptions: ExceptionItem[];
}

/** Mirrors buildData() + the world memo in src/lib/store.tsx, viewed at its default (latest) time. */
function build(): ApiWorld {
  const g = generate();
  const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
  const now = g.now;
  const cut = ms(now);
  const events = sim.events.filter((e) => ms(e.at) <= cut).sort((a, b) => ms(a.at) - ms(b.at));
  const world = replay(events);
  const kpis = computeKpis(sim.results.filter((r) => ms(r.clearedAt) <= cut));
  const exceptions = detectExceptions(world, g.directory, now);
  return { g, sim, world, now, kpis, exceptions };
}

// Stored on globalThis so that every route bundle in one server process shares a single copy.
const KEY = Symbol.for('madoun.api.world');
type Holder = { [KEY]?: ApiWorld };

export function getWorld(): ApiWorld {
  const h = globalThis as unknown as Holder;
  return (h[KEY] ??= build());
}
