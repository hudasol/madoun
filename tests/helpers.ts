import { makeDirectory, type Directory } from '@/engine/directory';
import type { EvidenceReceipt, GoodsItem, Shipment, Trader } from '@/engine/types';
import { AUTHORITIES, REQUIREMENTS } from '@/data/authorities';

export const NOW = '2026-10-09T02:00:00.000Z';

export const trader = (over: Partial<Trader> = {}): Trader => ({
  id: 'tr-t', name: 'Test Trader', nameAr: 'مستورد تجريبي', aeo: false, complianceScore: 90, pastFindings: 0, ...over,
});

export const dirWith = (traders: Trader[] = [trader()]): Directory =>
  makeDirectory({ authorities: AUTHORITIES, requirements: REQUIREMENTS, traders, forwarders: [{ id: 'fw-t', name: 'Test FW' }] });

export const item = (over: Partial<GoodsItem> = {}): GoodsItem => ({
  id: 'S1-I1', hsCode: '85176200', description: 'Wireless routers', category: 'wireless', origin: 'CN',
  value: 380 * 100, quantity: 100, packages: 5, flags: [], ...over,
});

export const shipment = (over: Partial<Shipment> = {}, items: GoodsItem[] = [item()]): Shipment => ({
  id: 'S1', declarationRef: 'DEC-1', mode: 'sea', carrier: 'C', conveyance: 'V', entryPoint: 'P',
  eta: '2026-10-11T02:00:00.000Z', filedAt: NOW, traderId: 'tr-t', forwarderId: 'fw-t', invoiceRef: 'INV-1',
  incoterm: 'CIF', currency: 'AED', totalValue: items.reduce((a, i) => a + i.value, 0),
  submitted: ['commercial-invoice', 'packing-list', 'transport-document', 'certificate-of-origin', 'conformity-certificate', 'type-approval'],
  consignments: [{ id: 'S1-C1', transportDocRef: 'BL-1', containerIds: ['ABCD1234567'], items }],
  ...over,
});

export const receipt = (over: Partial<EvidenceReceipt> = {}): EvidenceReceipt => ({
  id: 'r1', type: 'conformity-certificate', subjectRef: 'x', summary: 's', summaryAr: 's', issuer: 'supplier',
  verifiedBy: 'moiat', method: 'document-check',
  scope: { level: 'trader-product', traderId: 'tr-t', hs6: ['851762'] },
  validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z', status: 'verified',
  sharedWith: 'all', hash: 'h', prevHash: 'p', reuseLog: [], ...over,
});
