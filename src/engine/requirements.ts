import type { GoodsItem, Requirement, RequirementInstance, Shipment } from './types';
import { allItems } from './types';

export function appliesToItem(req: Requirement, item: GoodsItem): boolean {
  const catOk = req.categories.length === 0 || req.categories.includes(item.category);
  const flagOk = req.anyFlags.length === 0 || req.anyFlags.some((f) => item.flags.includes(f));
  return catOk && flagOk;
}

/** Which approvals does this shipment need, and which items does each cover? */
export function requirementsFor(shipment: Shipment, requirements: Requirement[]): RequirementInstance[] {
  const items = allItems(shipment);
  const out: RequirementInstance[] = [];
  for (const req of requirements) {
    const itemIds = items.filter((i) => appliesToItem(req, i)).map((i) => i.id);
    if (itemIds.length > 0) out.push({ requirementId: req.id, authorityId: req.authorityId, itemIds });
  }
  return out;
}
