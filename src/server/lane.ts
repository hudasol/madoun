import type { Lane, ShipmentFile } from '@/engine';

/** Effective lane: an officer override wins over the engine's recommendation (same rule as the UI store). */
export const laneOf = (f: ShipmentFile): Lane => f.override?.lane ?? f.assessment?.lane ?? 'green';
