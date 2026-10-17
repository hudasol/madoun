import type { Rng } from './rng';
import { addHours } from './time';
import type {
  ConfirmationDecision,
  EvidenceMethod,
  EvidenceReceipt,
  InspectionFinding,
  InspectionResult,
  InspectionTask,
  Outcome,
  RiskAssessment,
  Shipment,
} from './types';
import { allItems } from './types';

/**
 * The robotics seam. Madoun asks for an inspection; any performer (officer, scanner, drone,
 * ground robot) returns an InspectionResult; the result becomes evidence and an outcome.
 */

export function createInspectionTask(shipment: Shipment, assessment: RiskAssessment, now: string, requestedBy = 'madoun'): InspectionTask {
  const items = allItems(shipment);
  const urgent = items.some((i) => i.flags.includes('perishable') || i.flags.includes('cold-chain'));
  const scope = assessment.recommendedChecks.map((c) => c.text);
  const scopeAr = assessment.recommendedChecks.map((c) => c.textAr);
  const constraints: string[] = [];
  if (items.some((i) => i.flags.includes('hazardous'))) constraints.push('hazardous-materials-protocol');
  if (items.some((i) => i.flags.includes('cold-chain'))) constraints.push('keep-cold-chain-intact');
  if (items.some((i) => i.flags.includes('perishable'))) constraints.push('time-critical');
  return {
    id: `insp-${shipment.id}`,
    shipmentId: shipment.id,
    containerIds: shipment.consignments.flatMap((c) => c.containerIds),
    requestedAt: now,
    requestedBy,
    scope,
    scopeAr,
    priority: urgent ? 'high' : 'normal',
    constraints,
  };
}

const FINDING_AR: Record<InspectionFinding['kind'], string> = {
  none: 'لا ملاحظات',
  'seal-broken': 'ختم مكسور',
  'undeclared-goods': 'بضائع غير مصرح بها',
  'quantity-mismatch': 'عدم تطابق الكمية',
  damage: 'تلف في التغليف',
  'temperature-excursion': 'تجاوز في درجة الحرارة',
  'prohibited-item': 'مادة محظورة',
};

const METHOD: Record<InspectionResult['performerKind'], EvidenceMethod> = {
  robot: 'robotic-inspection',
  drone: 'robotic-inspection',
  scanner: 'scanner-review',
  officer: 'officer-inspection',
};

/**
 * Human confirmation rule (safety case core). A serious finding reported by a machine (robot, drone or
 * scanner) must be upheld or overturned by a customs officer before it can become verified evidence or
 * a learning outcome. Serious means any finding of severity 'major', or a broken seal. Results from an
 * officer need no second confirmation.
 */
export function requiresOfficerConfirmation(result: Pick<InspectionResult, 'performerKind' | 'findings' | 'seal'>): boolean {
  if (result.performerKind === 'officer') return false;
  return !result.seal.intact || result.findings.some((f) => f.severity === 'major');
}

/** The id of the receipt an inspection result becomes. */
export function inspectionReceiptId(taskId: string): string {
  return `rcpt-${taskId}`;
}

/** Hours between a machine result and the officer's confirmation in the simulator (an assumption, not a measurement). */
export const CONFIRMATION_DELAY_HOURS = 1;

/**
 * A completed inspection becomes a shareable receipt other authorities can rely on. A result that needs
 * officer confirmation starts as 'pending'; the InspectionConfirmed event makes it 'verified' (upheld) or
 * 'revoked' (overturned). Status is not part of the receipt hash, so confirmation never breaks the chain.
 */
export function resultToReceiptDraft(result: InspectionResult): Omit<EvidenceReceipt, 'hash' | 'prevHash' | 'reuseLog'> {
  const clean = result.findings.every((f) => f.kind === 'none');
  return {
    id: inspectionReceiptId(result.taskId),
    type: 'inspection-result',
    subjectRef: result.taskId,
    summary: clean
      ? `Inspection by ${result.performedBy}: no findings, seal ${result.seal.intact ? 'intact' : 'broken'}`
      : `Inspection by ${result.performedBy}: ${result.findings.map((f) => f.kind).join(', ')}`,
    summaryAr: clean
      ? `فحص بواسطة ${result.performedBy}: لا ملاحظات، الختم ${result.seal.intact ? 'سليم' : 'مكسور'}`
      : `فحص بواسطة ${result.performedBy}: ${result.findings.map((f) => FINDING_AR[f.kind]).join('، ')}`,
    issuer: result.performedBy,
    verifiedBy: 'adc',
    method: METHOD[result.performerKind],
    scope: { level: 'shipment', shipmentId: result.shipmentId },
    validFrom: result.completedAt,
    validUntil: addHours(result.completedAt, 72),
    status: requiresOfficerConfirmation(result) ? 'pending' : 'verified',
    sharedWith: 'all',
  };
}

export type Truth = { violation?: InspectionFinding['kind'] };

/**
 * Inspection-cell simulator. Ground truth is known only to the simulation, never to the engine.
 * Detection rate and false-positive rate are parameters, not claims about any real device.
 */
export function simulateInspectionCell(
  task: InspectionTask,
  truth: Truth,
  rng: Rng,
  now: string,
  performer: { id: string; kind: InspectionResult['performerKind'] } = { id: 'cell-A1', kind: 'robot' },
  opts = { detectionRate: 0.92, falsePositiveRate: 0.03 },
): InspectionResult {
  const findings: InspectionFinding[] = [];
  if (truth.violation && rng.chance(opts.detectionRate)) {
    findings.push({ kind: truth.violation, severity: truth.violation === 'damage' ? 'minor' : 'major', note: 'Detected during scripted inspection', noteAr: 'تم الرصد أثناء الفحص المبرمج' });
  } else if (!truth.violation && rng.chance(opts.falsePositiveRate)) {
    findings.push({ kind: 'damage', severity: 'info', note: 'Superficial packaging damage', noteAr: 'تلف سطحي في التغليف' });
  }
  if (findings.length === 0) findings.push({ kind: 'none', severity: 'info', note: 'No discrepancies found', noteAr: 'لم تُرصد أي مخالفات' });
  const sealBroken = findings.some((f) => f.kind === 'seal-broken');
  return {
    taskId: task.id,
    shipmentId: task.shipmentId,
    performedBy: performer.id,
    performerKind: performer.kind,
    completedAt: addHours(now, 2),
    seal: { id: `SEAL-${task.shipmentId.slice(-4)}`, intact: !sealBroken },
    findings,
    mediaRefs: [`media/${task.id}/overview.jpg`, `media/${task.id}/seal.jpg`],
  };
}

export function outcomeFromInspection(
  shipment: Shipment,
  assessment: RiskAssessment,
  result: InspectionResult | undefined,
  missingEvidence: Outcome['missingEvidence'],
  now: string,
  sampling: Outcome['sampling'] = 'risk',
  /** The officer's decision on a serious machine finding. 'overturned' means the finding was wrong. */
  confirmation?: ConfirmationDecision,
): Outcome {
  const confirmed = !!result && confirmation !== 'overturned' && result.findings.some((f) => f.kind !== 'none' && f.severity !== 'info');
  return {
    shipmentId: shipment.id,
    lane: assessment.lane,
    traderId: shipment.traderId,
    forwarderId: shipment.forwarderId,
    triggerKeys: assessment.perAuthority.flatMap((a) => a.signals.filter((s) => s.points > 0 && s.factor !== 'documentation-completeness').map((s) => s.key)),
    result: !result ? 'not-inspected' : confirmed ? 'confirmed' : 'false-alarm',
    ...(sampling === 'risk' ? {} : { sampling }),
    missingEvidence,
    recordedAt: now,
  };
}
