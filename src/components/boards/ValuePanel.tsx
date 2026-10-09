'use client';

import { useId, useState } from 'react';
import { useFormat, useT } from '@/lib/i18n';
import { Modelled } from './Figures';

const T = {
  en: {
    tag: 'illustrative', title: 'What it could be worth', intro: 'Put in your own volumes and cost of delay. The result uses the average time saved per shipment from the model above. Every default is a placeholder, not a fact.',
    perDay: 'Shipments per day', cost: 'Cost of one hour of delay per shipment (AED)', days: 'Working days per year', share: 'Share of the modelled gain that actually happens',
    hours: 'Hours of waiting avoided each year', value: 'Value of that time each year (AED)', avg: 'Average time saved per shipment in the model: {h}',
    formula: 'Value = shipments per day × working days × average hours saved × share realised × cost per hour.',
    note: 'Not included: effort to run Madoun, integration cost, and benefits that are hard to price such as fewer disputes. The cost of delay is a trader and port-operator cost, not revenue for the authority.',
    low: 'at half the share you entered',
  },
  ar: {
    tag: 'توضيحي', title: 'ما قد يعنيه ذلك من قيمة', intro: 'أدخل أحجامك وتكلفة التأخير. تعتمد النتيجة على متوسط الوقت الموفَّر لكل شحنة في النموذج أعلاه. كل القيم الافتراضية مجرد أمثلة وليست حقائق.',
    perDay: 'عدد الشحنات يومياً', cost: 'تكلفة ساعة تأخير واحدة لكل شحنة (درهم)', days: 'أيام العمل في السنة', share: 'نسبة المكسب المنمذج التي تتحقق فعلاً',
    hours: 'ساعات الانتظار التي تُتفادى سنوياً', value: 'قيمة هذا الوقت سنوياً (درهم)', avg: 'متوسط الوقت الموفَّر لكل شحنة في النموذج: {h}',
    formula: 'القيمة = الشحنات يومياً × أيام العمل × متوسط الساعات الموفَّرة × النسبة المتحققة × تكلفة الساعة.',
    note: 'غير مشمول: جهد تشغيل مدوّن، وتكلفة الربط، والفوائد التي يصعب تسعيرها كتقليل النزاعات. وتكلفة التأخير يتحملها التاجر ومشغّل الميناء وليست إيراداً للجهة.',
    low: 'عند نصف النسبة المُدخلة',
  },
};

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="w-40 px-3 py-1.5 text-base tabular-nums"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
      />
    </div>
  );
}

export function ValuePanel({ avgHoursSaved }: { avgHoursSaved: number }) {
  const t = useT(T);
  const f = useFormat();
  const [perDay, setPerDay] = useState(300);
  const [cost, setCost] = useState(25);
  const [days, setDays] = useState(300);
  const [share, setShare] = useState(50);

  const hours = perDay * days * avgHoursSaved * (share / 100);
  const value = hours * cost;

  return (
    <section className="mt-8" aria-labelledby="vp">
      <h2 id="vp" className="mb-1 text-[1.1rem]">{t('title')} <Modelled>{t('tag')}</Modelled></h2>
      <p className="max-w-[68ch] text-muted">{t('intro')}</p>
      <div className="panel mt-3 p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <NumberField label={t('perDay')} value={perDay} onChange={setPerDay} min={0} max={100000} step={50} />
          <NumberField label={t('cost')} value={cost} onChange={setCost} min={0} max={100000} step={5} />
          <NumberField label={t('days')} value={days} onChange={setDays} min={1} max={366} />
          <NumberField label={`${t('share')} (%)`} value={share} onChange={setShare} min={0} max={100} step={5} />
        </div>
        <dl className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">{t('hours')}</dt>
            <dd className="text-[1.5rem] font-semibold tabular-nums" aria-live="polite">{f.number(Math.round(hours))}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('value')}</dt>
            <dd className="text-[1.5rem] font-semibold tabular-nums" aria-live="polite">{f.number(Math.round(value))}</dd>
            <dd className="text-sm text-muted tabular-nums">{f.number(Math.round(value / 2))} {t('low')}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">{t('avg', { h: f.hours(avgHoursSaved) })}</p>
        <p className="mt-1 max-w-[68ch] text-sm text-muted">{t('formula')}</p>
        <p className="mt-2 max-w-[68ch] text-sm">{t('note')}</p>
      </div>
    </section>
  );
}
