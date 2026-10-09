import type { Authority, Requirement, Trader } from './types';

/** Reference data the engine needs but does not own. */
export interface Directory {
  authorities: Record<string, Authority>;
  requirements: Requirement[];
  requirementById: Record<string, Requirement>;
  traders: Record<string, Trader>;
  forwarders: Record<string, { id: string; name: string; nameAr?: string }>;
}

export function makeDirectory(input: {
  authorities: Authority[];
  requirements: Requirement[];
  traders: Trader[];
  forwarders: { id: string; name: string; nameAr?: string }[];
}): Directory {
  return {
    authorities: Object.fromEntries(input.authorities.map((a) => [a.id, a])),
    requirements: input.requirements,
    requirementById: Object.fromEntries(input.requirements.map((r) => [r.id, r])),
    traders: Object.fromEntries(input.traders.map((t) => [t.id, t])),
    forwarders: Object.fromEntries(input.forwarders.map((f) => [f.id, f])),
  };
}
