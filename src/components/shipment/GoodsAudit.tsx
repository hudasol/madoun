'use client';

import type { ShipmentFile } from '@/engine';
import { allItems } from '@/engine';
import { useBi, useFormat, useLocale, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    goods: 'Goods', hs: 'HS code', desc: 'Description', origin: 'Origin', value: 'Value (AED)', qty: 'Quantity', flags: 'Flags', none: 'none',
    audit: 'Audit trail', time: 'Time', actor: 'Actor', action: 'What happened', auditHint: 'Every change to this file, oldest first. Entries are never edited.',
    f_perishable: 'perishable', 'f_cold-chain': 'cold chain', f_hazardous: 'hazardous', 'f_high-risk-food': 'higher-risk food',
  },
  ar: {
    goods: 'البضائع', hs: 'الرمز الجمركي', desc: 'الوصف', origin: 'المنشأ', value: 'القيمة (درهم)', qty: 'الكمية', flags: 'علامات', none: 'لا شيء',
    audit: 'سجل التدقيق', time: 'الوقت', actor: 'الفاعل', action: 'ما حدث', auditHint: 'كل تغيير على هذا الملف، من الأقدم. لا تُعدَّل المدخلات أبداً.',
    f_perishable: 'قابل للتلف', 'f_cold-chain': 'سلسلة تبريد', f_hazardous: 'خطر', 'f_high-risk-food': 'غذاء أعلى خطورة',
  },
};

export function GoodsTable({ file }: { file: ShipmentFile }) {
  const t = useT(T);
  const bi = useBi();
  const f = useFormat();
  const { locale } = useLocale();
  const items = allItems(file.shipment);
  let region: Intl.DisplayNames | null = null;
  try { region = new Intl.DisplayNames(locale === 'ar' ? 'ar' : 'en', { type: 'region' }); } catch { /* fall back to code */ }
  const flag = (x: string) => { const k = `f_${x}` as 'f_perishable'; return k in T.en ? t(k) : x; };
  return (
    <section className="panel" aria-labelledby="g-h">
      <header className="border-b border-line px-4 py-3"><h2 id="g-h" className="text-[1.05rem]">{t('goods')}</h2></header>
      <div className="overflow-x-auto">
        <table className="table-clean min-w-[44rem] text-[0.95rem]">
          <thead><tr>
            <th scope="col">{t('hs')}</th><th scope="col">{t('desc')}</th><th scope="col">{t('origin')}</th>
            <th scope="col" className="!text-end">{t('value')}</th><th scope="col" className="!text-end">{t('qty')}</th><th scope="col">{t('flags')}</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="mono text-[0.88rem]">{i.hsCode}</td>
                <td>{bi(i.description, i.descriptionAr)}</td>
                <td>{region?.of(i.origin) ?? i.origin}</td>
                <td className="text-end">{f.number(i.value)}</td>
                <td className="text-end">{f.number(i.quantity)}</td>
                <td>{i.flags.length ? i.flags.map(flag).join(', ') : <span className="text-muted">{t('none')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AuditTrail({ file }: { file: ShipmentFile }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const L = useLabels();
  const dir = useStore().directory;
  // Audit lines carry requirement ids ('cus-docs'); show the requirement's name instead.
  const withRequirementNames = (text: string) => {
    if (!dir) return text;
    let out = text;
    for (const r of [...dir.requirements].sort((x, y) => y.id.length - x.id.length)) out = out.split(r.id).join(bi(r.label, r.labelAr));
    return out;
  };
  return (
    <section className="panel" aria-labelledby="a-h">
      <header className="border-b border-line px-4 py-3">
        <h2 id="a-h" className="text-[1.05rem]">{t('audit')}</h2>
        <p className="text-sm text-muted">{t('auditHint')}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="table-clean min-w-[36rem] text-[0.95rem]">
          <thead><tr><th scope="col">{t('time')}</th><th scope="col">{t('actor')}</th><th scope="col">{t('action')}</th></tr></thead>
          <tbody>
            {[...file.audit].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((a, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{f.dateTime(a.at)}</td>
                <td>{L.owner(a.actor)}</td>
                <td>{L.actorsIn(withRequirementNames(bi(a.action, a.actionAr)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
