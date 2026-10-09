import type { Directory } from '@/engine/directory';
import { makeDirectory } from '@/engine/directory';
import { makeRng, type Rng } from '@/engine/rng';
import { addHours } from '@/engine/time';
import type {
  EvidenceType,
  Forwarder,
  GoodsCategory,
  GoodsItem,
  InspectionFinding,
  MadounEvent,
  Shipment,
  Trader,
  TransportMode,
} from '@/engine/types';
import { AUTHORITIES, REQUIREMENTS } from './authorities';
import { REFERENCE_UNIT_VALUE } from './risk';
import { requirementsFor } from '@/engine/requirements';

/**
 * Synthetic data. No real trader, shipment or person appears here: names are invented.
 * Planted situations (see the list at the bottom of this file) make the demo and the tests meaningful.
 */

export interface Truth {
  violation?: InspectionFinding['kind'];
  /** Evidence types missing at first submission. */
  missing: EvidenceType[];
}

export interface Generated {
  seed: number;
  now: string;
  directory: Directory;
  shipments: Shipment[];
  seedEvents: MadounEvent[];
  truth: Record<string, Truth>;
}

const TRADER_NAMES: [string, string][] = [
  ['Gulf Harvest Trading', 'الخليج للحصاد التجارية'],
  ['Falcon Electronics LLC', 'فالكون للإلكترونيات'],
  ['Al Dana Pharma Supplies', 'الدانة لإمدادات الأدوية'],
  ['Marina Textile House', 'دار المرسى للنسيج'],
  ['Crescent Chemicals', 'الهلال للكيماويات'],
  ['Sahara Machinery Co', 'الصحراء للآلات'],
  ['Oasis Fresh Foods', 'الواحة للأغذية الطازجة'],
  ['Pearl Beauty Imports', 'اللؤلؤة لمستحضرات التجميل'],
  ['Skyline Wireless', 'سكاي لاين للاتصالات'],
  ['Nakheel General Trading', 'النخيل للتجارة العامة'],
  ['Mirage Medical Devices', 'السراب للأجهزة الطبية'],
  ['Wahat Home Goods', 'واحات للمستلزمات المنزلية'],
  ['Zahra Spice Traders', 'الزهراء لتجارة التوابل'],
  ['Noor Tech Distribution', 'نور تك للتوزيع'],
  ['Barakah Industrial Supply', 'بركة للإمدادات الصناعية'],
];

const FORWARDERS: Forwarder[] = [
  { id: 'fw-harbour', name: 'Harbour Gate Logistics' },
  { id: 'fw-desert', name: 'Desert Line Freight' },
  { id: 'fw-pearl', name: 'Pearl Cargo Services' },
  { id: 'fw-falcon', name: 'Falcon Bridge Shipping' },
  { id: 'fw-oasis', name: 'Oasis Forwarding' },
];

interface CatalogEntry {
  category: GoodsCategory;
  hs: string;
  description: string;
  flags: string[];
  origins: string[];
  unitFactor: number; // multiplier vs reference unit value
}

const CATALOG: CatalogEntry[] = [
  { category: 'food', hs: '02071400', description: 'Frozen poultry cuts', flags: ['high-risk-food', 'perishable'], origins: ['BR', 'FR', 'TR'], unitFactor: 1 },
  { category: 'food', hs: '04021000', description: 'Milk powder', flags: ['high-risk-food'], origins: ['NZ', 'DE', 'FR'], unitFactor: 1 },
  { category: 'food', hs: '10063000', description: 'Milled rice', flags: [], origins: ['IN', 'PK', 'TH'], unitFactor: 1 },
  { category: 'food', hs: '09109100', description: 'Mixed spices', flags: [], origins: ['IN', 'ID', 'VN'], unitFactor: 1 },
  { category: 'electronics', hs: '84713000', description: 'Laptop computers', flags: [], origins: ['CN', 'VN', 'KR'], unitFactor: 1 },
  { category: 'electronics', hs: '85044000', description: 'Power adapters', flags: [], origins: ['CN', 'VN'], unitFactor: 1 },
  { category: 'wireless', hs: '85176200', description: 'Wireless routers', flags: [], origins: ['CN', 'KR', 'TW'], unitFactor: 1 },
  { category: 'pharma', hs: '30049000', description: 'Packaged medicaments', flags: ['cold-chain'], origins: ['DE', 'IN', 'CH'], unitFactor: 1 },
  { category: 'pharma', hs: '30043200', description: 'Hormonal medicaments', flags: ['controlled', 'cold-chain'], origins: ['DE', 'CH'], unitFactor: 1 },
  { category: 'medical-device', hs: '90183100', description: 'Disposable syringes', flags: [], origins: ['CN', 'DE', 'MY'], unitFactor: 1 },
  { category: 'chemicals', hs: '28151100', description: 'Sodium hydroxide', flags: ['hazardous'], origins: ['CN', 'IN', 'DE'], unitFactor: 1 },
  { category: 'chemicals', hs: '32081000', description: 'Industrial paint', flags: [], origins: ['IT', 'TR', 'CN'], unitFactor: 1 },
  { category: 'textiles', hs: '61091000', description: 'Cotton T-shirts', flags: [], origins: ['BD', 'IN', 'TR'], unitFactor: 1 },
  { category: 'textiles', hs: '62046200', description: 'Women trousers', flags: [], origins: ['CN', 'VN', 'TR'], unitFactor: 1 },
  { category: 'machinery', hs: '84137000', description: 'Centrifugal pumps', flags: [], origins: ['DE', 'IT', 'CN'], unitFactor: 1 },
  { category: 'machinery', hs: '84295200', description: 'Excavator parts', flags: [], origins: ['JP', 'DE', 'KR'], unitFactor: 1 },
  { category: 'cosmetics', hs: '33049900', description: 'Skin-care creams', flags: [], origins: ['FR', 'KR', 'US'], unitFactor: 1 },
  { category: 'general', hs: '39269000', description: 'Plastic household articles', flags: [], origins: ['CN', 'TH', 'ID'], unitFactor: 1 },
  { category: 'general', hs: '94036000', description: 'Wooden furniture', flags: [], origins: ['MY', 'ID', 'IT'], unitFactor: 1 },
];


/** Which catalog categories a trader mostly imports. */
function traderCategories(rng: Rng, idx: number): GoodsCategory[] {
  const primary: GoodsCategory[][] = [
    ['food'], ['electronics', 'wireless'], ['pharma'], ['textiles'], ['chemicals'], ['machinery'], ['food'], ['cosmetics'],
    ['wireless', 'electronics'], ['general'], ['medical-device'], ['general', 'textiles'], ['food'], ['electronics'], ['machinery', 'chemicals'],
  ];
  void rng;
  return primary[idx % primary.length];
}

function containerId(rng: Rng): string {
  const letters = Array.from({ length: 4 }, () => String.fromCharCode(65 + rng.int(0, 25))).join('');
  return `${letters}${String(rng.int(0, 9999999)).padStart(7, '0')}`;
}

const MODE_SPECS: Record<TransportMode, { entry: string[]; carrier: string[]; lead: [number, number] }> = {
  sea: { entry: ['Khalifa Port', 'Zayed Port'], carrier: ['Gulf Line', 'Blue Meridian', 'Eastern Arc'], lead: [48, 120] },
  air: { entry: ['Air Cargo Terminal'], carrier: ['Skyroute Cargo', 'Meridian Air'], lead: [8, 30] },
  land: { entry: ['Land Border Crossing'], carrier: ['Dune Haulage', 'Route 11 Transport'], lead: [6, 20] },
};

export interface GenerateOptions {
  seed?: number;
  shipments?: number;
  /** "Current time" of the snapshot. */
  now?: string;
  days?: number;
}

export function generate(opts: GenerateOptions = {}): Generated {
  const seed = opts.seed ?? 2026;
  const count = opts.shipments ?? 240;
  const now = opts.now ?? '2026-10-09T02:00:00.000Z';
  const days = opts.days ?? 7;
  const rng = makeRng(seed);

  /* ---- Traders ---- */
  const traders: Trader[] = TRADER_NAMES.map(([name, nameAr], i) => {
    const aeo = i === 0 || i === 1 || i === 2 || i === 5;
    const low = i === 9 || i === 12; // planted lower-compliance traders
    const mid = i === 13 || i === 7;
    const complianceScore = aeo ? rng.int(90, 98) : low ? rng.int(42, 58) : mid ? rng.int(64, 78) : rng.int(80, 92);
    const pastFindings = low ? rng.int(3, 5) : mid ? rng.int(1, 2) : aeo ? 0 : rng.int(0, 1);
    return { id: `tr-${String(i + 1).padStart(2, '0')}`, name, nameAr, aeo, complianceScore, pastFindings };
  });

  const directory = makeDirectory({ authorities: AUTHORITIES, requirements: REQUIREMENTS, traders, forwarders: FORWARDERS });

  /* ---- Shipments ---- */
  const shipments: Shipment[] = [];
  const truth: Record<string, Truth> = {};
  const start = addHours(now, -days * 24);

  const traderCats = traders.map((_, i) => traderCategories(rng, i));
  const stableOrigins = new Map<string, string>(); // per trader+entry, so origins repeat (supports "first-time origin" signal)

  for (let n = 1; n <= count; n++) {
    const tIdx = rng.int(0, traders.length - 1);
    const trader = traders[tIdx];
    const cats = traderCats[tIdx];
    const mode: TransportMode = rng.pick(['sea', 'sea', 'sea', 'air', 'air', 'land'] as const);
    const spec = MODE_SPECS[mode];

    const offsetHours = Math.floor(rng.next() * days * 24);
    const filedAt = addHours(start, offsetHours);
    const lead = rng.int(spec.lead[0], spec.lead[1]);
    const eta = addHours(filedAt, lead);

    const id = `SHP-${String(n).padStart(4, '0')}`;
    const itemCount = rng.int(1, 3);
    const items: GoodsItem[] = [];
    const undervalued = rng.chance(trader.complianceScore < 60 ? 0.28 : 0.04);
    const forceUnusualOrigin = rng.chance(0.04);

    for (let k = 0; k < itemCount; k++) {
      const cat = rng.pick(cats);
      const options = CATALOG.filter((c) => c.category === cat);
      const entry = rng.pick(options);
      const stableKey = `${trader.id}:${entry.hs}`;
      let origin = stableOrigins.get(stableKey);
      if (!origin || forceUnusualOrigin) {
        origin = rng.pick(entry.origins);
        if (!forceUnusualOrigin) stableOrigins.set(stableKey, origin);
      }
      const quantity = rng.int(20, 800);
      const ref = REFERENCE_UNIT_VALUE[entry.category];
      const factor = undervalued && k === 0 ? 0.2 + rng.next() * 0.2 : 0.8 + rng.next() * 0.6;
      items.push({
        id: `${id}-I${k + 1}`,
        hsCode: entry.hs,
        description: entry.description,
        category: entry.category,
        origin,
        value: Math.round(quantity * ref * factor),
        quantity,
        packages: Math.max(1, Math.round(quantity / rng.int(10, 40))),
        flags: entry.flags,
      });
    }

    const containerCount = mode === 'sea' ? rng.int(1, 2) : 0;
    const forwarder = rng.pick(FORWARDERS);
    const shipment: Shipment = {
      id,
      declarationRef: `DEC-26-${String(100000 + n * 37)}`,
      mode,
      carrier: rng.pick(spec.carrier),
      conveyance: mode === 'sea' ? `MV ${rng.pick(['Aurora', 'Sandpiper', 'Horizon', 'Tidewater'])} ${rng.int(100, 999)}` : mode === 'air' ? `FL${rng.int(100, 999)}` : `TRK-${rng.int(1000, 9999)}`,
      entryPoint: rng.pick(spec.entry),
      eta,
      filedAt,
      traderId: trader.id,
      forwarderId: forwarder.id,
      invoiceRef: `INV-${rng.int(10000, 99999)}`,
      incoterm: rng.pick(['CIF', 'FOB', 'CFR', 'EXW']),
      currency: 'AED',
      totalValue: items.reduce((a, i) => a + i.value, 0),
      submitted: [],
      consignments: [
        {
          id: `${id}-C1`,
          transportDocRef: `${mode === 'air' ? 'AWB' : mode === 'sea' ? 'BL' : 'CMR'}-${rng.int(100000, 999999)}`,
          containerIds: Array.from({ length: containerCount }, () => containerId(rng)),
          items,
        },
      ],
    };

    /* ---- Which documents were actually submitted? ---- */
    const needed = new Set<EvidenceType>();
    for (const inst of requirementsFor(shipment, REQUIREMENTS)) {
      for (const t of directory.requirementById[inst.requirementId].evidenceTypes) needed.add(t);
    }
    const missing: EvidenceType[] = [];
    // Planted: Desert Line Freight often omits the packing list.
    if (forwarder.id === 'fw-desert' && needed.has('packing-list') && rng.chance(0.45)) missing.push('packing-list');
    // Random omissions.
    for (const t of needed) if (!missing.includes(t) && rng.chance(0.035)) missing.push(t);
    shipment.submitted = [...needed].filter((t) => !missing.includes(t));
    truth[id] = { missing };

    /* ---- Hidden ground truth for inspections ---- */
    const baseRate = trader.complianceScore < 60 ? 0.42 : trader.complianceScore < 80 ? 0.15 : trader.aeo ? 0.015 : 0.055;
    const violationRate = undervalued ? Math.max(baseRate, 0.55) : baseRate;
    if (rng.chance(violationRate)) {
      truth[id].violation = undervalued ? rng.pick(['quantity-mismatch', 'undeclared-goods'] as const) : rng.pick(['seal-broken', 'undeclared-goods', 'quantity-mismatch', 'temperature-excursion'] as const);
    }

    shipments.push(shipment);
  }

  shipments.sort((a, b) => a.filedAt.localeCompare(b.filedAt));

  return { seed, now, directory, shipments, seedEvents: [], truth };
}

/*
 * Planted situations (all deterministic for a given seed):
 *  - Desert Line Freight omits the packing list on a large share of its shipments (recurring missing evidence).
 *  - Two lower-compliance traders and two moderate ones, so trader-history signals fire often.
 *  - Some traders under-declare value; most of those shipments hide a real discrepancy.
 *  - Some shipments source from an origin new to that trader.
 *  - Reusable product-level receipts are issued as shipments complete; some are shared only with their own
 *    authority, some expire soon, and some cover only part of a later shipment (see simulate.ts).
 */
