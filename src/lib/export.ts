import type { Directory, EvidenceReceipt, Lane, ShipmentFile, ShipmentPlan, World } from '@/engine';

/**
 * Clearance record: everything a post-clearance auditor (WTO TFA Art. 7.5) would want about one shipment,
 * in a machine-readable form. Synthetic in this demo; the format is versioned so it can be kept stable.
 */
export const RECORD_SCHEMA = 'madoun.clearance-record/0.1';

export function clearanceRecord(world: World, dir: Directory, file: ShipmentFile, plan: ShipmentPlan, effectiveLane: Lane, at: string) {
  const ids = new Set(plan.checks.map((c) => c.receiptId).filter((x): x is string => !!x));
  const receipts: Pick<EvidenceReceipt, 'id' | 'type' | 'verifiedBy' | 'issuer' | 'method' | 'scope' | 'validFrom' | 'validUntil' | 'status' | 'sharedWith' | 'hash' | 'prevHash' | 'reuseLog'>[] =
    world.receipts.filter((r) => ids.has(r.id)).map((r) => ({
      id: r.id, type: r.type, verifiedBy: r.verifiedBy, issuer: r.issuer, method: r.method, scope: r.scope,
      validFrom: r.validFrom, validUntil: r.validUntil, status: r.status, sharedWith: r.sharedWith, hash: r.hash, prevHash: r.prevHash, reuseLog: r.reuseLog,
    }));
  return {
    schema: RECORD_SCHEMA,
    synthetic: true,
    generatedAt: at,
    declarationRef: file.shipment.declarationRef,
    shipment: file.shipment,
    lane: { effective: effectiveLane, recommended: plan.assessment.lane, pathway: plan.assessment.pathway, auditFlag: plan.assessment.auditFlag, override: file.override ?? null },
    riskReasons: plan.assessment.reasons,
    approvals: plan.reviewPlan.reviews.map((r) => ({
      requirementId: r.requirementId, authority: dir.authorities[r.authorityId]?.name ?? r.authorityId, mode: r.mode, verdict: r.verdict, reliesOn: r.reliesOn ?? [],
      review: file.reviews[r.requirementId] ?? null,
    })),
    evidenceChecks: plan.checks,
    receipts,
    exceptions: file.exceptions,
    inspection: { task: file.inspectionTask ?? null, result: file.inspectionResult ?? null },
    cleared: file.cleared ?? null,
    auditTrail: file.audit,
  };
}

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function auditCsv(file: ShipmentFile): string {
  return toCsv(['time', 'actor', 'action'], [...file.audit].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((a) => [a.at, a.actor, a.action]));
}

export function ledgerCsv(receipts: EvidenceReceipt[]): string {
  return toCsv(
    ['id', 'type', 'verified_by', 'issuer', 'method', 'scope', 'valid_from', 'valid_until', 'status', 'shared_with', 'times_reused', 'hash', 'prev_hash'],
    receipts.map((r) => [r.id, r.type, r.verifiedBy, r.issuer, r.method, r.scope.level, r.validFrom, r.validUntil, r.status, r.sharedWith === 'all' ? 'all' : r.sharedWith.join(' '), r.reuseLog.length, r.hash, r.prevHash]),
  );
}

export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
