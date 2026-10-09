import { describe, expect, it } from 'vitest';
import { apply, emptyWorld, replay, verifyChain, type World } from '@/engine';
import { getWorld } from '@/server/world';

/**
 * `replay` uses an in-place builder with indexes for speed; `apply` is the plain pure reducer.
 * They must never drift apart, so this folds the same events both ways and compares everything.
 */
describe('fast replay equals the pure reducer', () => {
  const { sim } = getWorld();
  const events = [...sim.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  it('produces an identical world for the full simulated history', () => {
    const fast = replay(events);
    const pure = events.reduce<World>(apply, emptyWorld());
    expect(fast).toEqual(pure);
    expect(verifyChain(fast.receipts).valid).toBe(true);
  });

  it('matches at arbitrary prefixes, so time-travel in the UI shows the same thing as a fold', () => {
    for (const frac of [0.1, 0.37, 0.64, 0.9]) {
      const prefix = events.slice(0, Math.floor(events.length * frac));
      expect(replay(prefix)).toEqual(prefix.reduce<World>(apply, emptyWorld()));
    }
  });

  it('does not mutate the world it was started from', () => {
    const half = replay(events.slice(0, 200));
    const snapshot = JSON.stringify(half);
    replay(events.slice(200, 400), half);
    expect(JSON.stringify(half)).toBe(snapshot);
  });
});
