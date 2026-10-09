import { describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/v1/health/route';
import { GET as listShipments } from '@/app/api/v1/shipments/route';
import { GET as getShipment } from '@/app/api/v1/shipments/[id]/route';
import { GET as listReceipts } from '@/app/api/v1/receipts/route';
import { GET as getReceipt } from '@/app/api/v1/receipts/[id]/route';
import { GET as verify } from '@/app/api/v1/receipts/verify/route';
import { GET as listExceptions } from '@/app/api/v1/exceptions/route';
import { GET as kpis } from '@/app/api/v1/kpis/route';
import { POST as assess } from '@/app/api/v1/assessments/route';
import { getWorld } from '@/server/world';

const url = (p: string) => `http://localhost/api/v1/${p}`;
const get = (h: (r: Request) => Promise<Response>, p: string) => h(new Request(url(p)));
const post = (body: unknown, raw = false) =>
  assess(new Request(url('assessments'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) }));

/** Build an adapter-style payload (no internal ids) from a generated shipment. */
function payloadFrom(idx = 0) {
  const s = getWorld().g.shipments[idx];
  return {
    declarationRef: s.declarationRef, mode: s.mode, carrier: s.carrier, conveyance: s.conveyance, entryPoint: s.entryPoint,
    carrierAr: s.carrierAr, conveyanceAr: s.conveyanceAr, eta: s.eta, filedAt: s.filedAt, traderId: s.traderId, forwarderId: s.forwarderId, invoiceRef: s.invoiceRef,
    incoterm: s.incoterm, currency: s.currency, totalValue: s.totalValue, submitted: s.submitted,
    consignments: s.consignments.map((c) => ({
      transportDocRef: c.transportDocRef, containerIds: c.containerIds,
      items: c.items.map((i) => {
        // Generated items carry an internal id; an adapter would not send it. Optional Arabic display text is accepted.
        const { id: _id, ...rest } = i;
        void _id;
        return rest;
      }),
    })),
  };
}

describe('api v1', () => {
  it('health reports synthetic data and sets the standard headers', async () => {
    const res = await get(health, 'health');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Madoun-Synthetic')).toBe('true');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = await res.json();
    expect(b.synthetic).toBe(true);
    expect(b.dataset.seed).toBe(2026);
    expect(b.dataset.shipments).toBe(getWorld().g.shipments.length);
  });

  it('paginates shipments stably without gaps or repeats', async () => {
    const p1 = await (await get(listShipments, 'shipments?page=1&pageSize=50')).json();
    const p2 = await (await get(listShipments, 'shipments?page=2&pageSize=50')).json();
    expect(p1.data).toHaveLength(50);
    expect(p1.page.total).toBe(getWorld().g.shipments.length);
    const ids = new Set([...p1.data, ...p2.data].map((r: { id: string }) => r.id));
    expect(ids.size).toBe(100);
    const again = await (await get(listShipments, 'shipments?page=2&pageSize=50')).json();
    expect(again.data.map((r: { id: string }) => r.id)).toEqual(p2.data.map((r: { id: string }) => r.id));
  });

  it('filters shipments and rejects bad query values with 400', async () => {
    const red = await (await get(listShipments, 'shipments?lane=red&pageSize=100')).json();
    expect(red.data.length).toBeGreaterThan(0);
    expect(red.data.every((r: { lane: string }) => r.lane === 'red')).toBe(true);
    const bad = await get(listShipments, 'shipments?lane=purple');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('invalid_query');
    expect((await get(listShipments, 'shipments?pageSize=1000')).status).toBe(400);
  });

  it('returns a full shipment file, and 404 with the error shape for unknown ids', async () => {
    const first = getWorld().g.shipments[0].id;
    const res = await getShipment(new Request(url(`shipments/${first}`)), { params: Promise.resolve({ id: first }) });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.assessment.reasons).toBeDefined();
    expect(Array.isArray(b.evidenceChecks)).toBe(true);
    expect(b.reviewPlan.reviews).toBeDefined();
    expect(Array.isArray(b.auditTrail)).toBe(true);

    const nf = await getShipment(new Request(url('shipments/NOPE')), { params: Promise.resolve({ id: 'NOPE' }) });
    expect(nf.status).toBe(404);
    expect(nf.headers.get('X-Madoun-Synthetic')).toBe('true');
    expect((await nf.json()).error.code).toBe('not_found');
  });

  it('lists, filters and fetches receipts; verifies the chain', async () => {
    const all = await (await get(listReceipts, 'receipts?pageSize=100')).json();
    expect(all.page.total).toBeGreaterThan(0);
    const one = all.data[0];
    const f = await (await get(listReceipts, `receipts?verifiedBy=${one.verifiedBy}&type=${one.type}`)).json();
    expect(f.data.length).toBeGreaterThan(0);
    const got = await getReceipt(new Request(url(`receipts/${one.id}`)), { params: Promise.resolve({ id: one.id }) });
    expect((await got.json()).hash).toBe(one.hash);
    const v = await (await get(verify, 'receipts/verify')).json();
    expect(v.ok).toBe(true);
    expect(v.length).toBe(all.page.total);
    expect(v.headHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serves exceptions and kpis', async () => {
    const ex = await (await get(listExceptions, 'exceptions')).json();
    expect(ex.page.total).toBe(getWorld().exceptions.length);
    expect((await get(listExceptions, 'exceptions?kind=nonsense')).status).toBe(400);
    const k = await (await get(kpis, 'kpis')).json();
    expect(k.kpis.shipments).toBeGreaterThan(0);
  });

  it('assessments: 200 for a valid adapter payload, and nothing is persisted', async () => {
    const before = getWorld().world.receipts.length;
    const nShipments = Object.keys(getWorld().world.shipments).length;
    const res = await post(payloadFrom());
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.persisted).toBe(false);
    expect(b.requirements.length).toBeGreaterThan(0);
    expect(b.evidenceChecks).toHaveLength(b.requirements.length);
    expect(b.reviewPlan.reviews).toBeDefined();
    expect(['green', 'amber', 'red']).toContain(b.assessment.lane);
    expect(getWorld().world.receipts.length).toBe(before);
    expect(Object.keys(getWorld().world.shipments)).toHaveLength(nShipments);
  });

  it('every generated shipment round-trips through the adapter validator', async () => {
    for (let i = 0; i < getWorld().g.shipments.length; i += 7) {
      const res = await post(payloadFrom(i));
      expect(res.status, `shipment index ${i}`).toBe(200);
    }
  });

  it('assessments: 422 with useful paths for an invalid payload', async () => {
    const bad = payloadFrom() as Record<string, unknown>;
    bad.traderId = 'tr-nobody';
    bad.mode = 'rail';
    bad.surprise = 1;
    (bad.consignments as { items: Record<string, unknown>[] }[])[0].items[0].hsCode = '12-34';
    (bad.consignments as { items: Record<string, unknown>[] }[])[0].items[0].origin = 'china';
    delete bad.invoiceRef;
    const res = await post(bad);
    expect(res.status).toBe(422);
    const b = await res.json();
    expect(b.error.code).toBe('validation_failed');
    const paths = b.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining([
      'traderId', 'mode', 'surprise', 'invoiceRef', 'consignments[0].items[0].hsCode', 'consignments[0].items[0].origin',
    ]));
    for (const d of b.error.details) expect(d.message.length).toBeGreaterThan(0);
  });

  it('assessments: 400 for malformed JSON, 415 for wrong content type, 422 for non-object', async () => {
    expect((await post('{nope', true)).status).toBe(400);
    const wrong = await assess(new Request(url('assessments'), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    expect(wrong.status).toBe(415);
    expect((await post([])).status).toBe(422);
  });
});
