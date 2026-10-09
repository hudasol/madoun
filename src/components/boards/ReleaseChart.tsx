'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lane, ShipmentSimResult } from '@/engine';
import { LANE_COLOR } from '@/components/LaneBadge';
import { useFormat, useT } from '@/lib/i18n';

const T = {
  en: {
    x: 'Hours between filing and arrival', y: 'Hours to release', arrival: 'Arrival', below: 'Below the line: released before arrival', above: 'Above: released after arrival',
    today: 'Today', madoun: 'With Madoun', title: 'Release time for each shipment, today and with Madoun (modelled)',
    read: 'Arrives {lead} after filing. Released after {today} today, {madoun} with Madoun.',
    hint: 'Point at a pair to read it.', green: 'green lane', amber: 'amber lane', red: 'red lane',
    summary: 'Of {n} shipments, {a} are released before arrival today and {b} with Madoun. Modelled on synthetic data.',
  },
  ar: {
    x: 'الساعات بين تقديم الملف والوصول', y: 'الساعات حتى الإفراج', arrival: 'الوصول', below: 'تحت الخط: إفراج قبل الوصول', above: 'فوق الخط: إفراج بعد الوصول',
    today: 'اليوم', madoun: 'مع مدوّن', title: 'زمن الإفراج لكل شحنة، اليوم ومع مدوّن (محاكاة)',
    read: 'تصل بعد {lead} من تقديم الملف. أُفرج عنها بعد {today} اليوم، وبعد {madoun} مع مدوّن.',
    hint: 'مرّر المؤشر على زوج نقاط لقراءته.', green: 'المسار الأخضر', amber: 'المسار الكهرماني', red: 'المسار الأحمر',
    summary: 'من بين {n} شحنة، يُفرج عن {a} قبل الوصول اليوم و{b} مع مدوّن. محاكاة على بيانات اصطناعية.',
  },
};

const css = `
.rc{--m:#3987e5;--b:#c3c2b7;--grid:#383835;--axis:#898781}
@media (prefers-color-scheme: light){:root:not([data-theme='dark']) .rc{--m:#2a78d6;--b:#52514e;--grid:#d4dde3;--axis:#6a7e8b}}
:root[data-theme='light'] .rc{--m:#2a78d6;--b:#52514e;--grid:#d4dde3;--axis:#6a7e8b}
`;

export function ReleaseChart({ rows }: { rows: ShipmentSimResult[] }) {
  const t = useT(T);
  const f = useFormat();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<ShipmentSimResult | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const h = Math.round(Math.min(480, Math.max(300, w * 0.62)));
  const m = { l: 46, r: 14, t: 12, b: 44 };
  const maxX = useMemo(() => Math.max(24, Math.ceil(Math.max(...rows.map((r) => r.leadHours), 0) / 24) * 24), [rows]);
  const maxY = useMemo(() => Math.max(24, Math.ceil(Math.max(...rows.map((r) => Math.max(r.todayHours, r.madounHours)), 0) / 12) * 12), [rows]);
  const X = (v: number) => m.l + (v / maxX) * (w - m.l - m.r);
  const Y = (v: number) => h - m.b - (v / maxY) * (h - m.t - m.b);
  const xt = Array.from({ length: Math.floor(maxX / 24) + 1 }, (_, i) => i * 24);
  const yt = Array.from({ length: Math.floor(maxY / 12) + 1 }, (_, i) => i * 12);
  const diagEnd = Math.min(maxX, maxY);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    let best: ShipmentSimResult | null = null, bd = 14 * 14;
    for (const r of rows) {
      const dx = X(r.leadHours) - px;
      for (const v of [r.todayHours, r.madounHours]) {
        const d = dx * dx + (Y(Math.min(v, maxY)) - py) ** 2;
        if (d < bd) { bd = d; best = r; }
      }
    }
    setHover(best);
  };

  return (
    <div className="rc">
      <style>{css}</style>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--b)" strokeWidth="1.6" /></svg>{t('today')}</li>
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--m)" /></svg>{t('madoun')}</li>
        <li className="inline-flex items-center gap-2"><svg width="22" height="12" aria-hidden="true"><line x1="1" y1="11" x2="21" y2="1" stroke="var(--axis)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>{t('arrival')}</li>
      </ul>
      <div ref={wrap} className="w-full" dir="ltr">
        <svg width={w} height={h} role="img" aria-label={t('title')} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
          <title>{t('title')}</title>
          {yt.map((v) => <g key={`y${v}`}><line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeWidth="1" /><text x={m.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--axis)">{f.number(v)}</text></g>)}
          {xt.map((v) => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={Y(0)} y2={Y(0) + 4} stroke="var(--axis)" /><text x={X(v)} y={Y(0) + 17} textAnchor="middle" fontSize="11" fill="var(--axis)">{f.number(v)}</text></g>)}
          <text x={(m.l + w - m.r) / 2} y={h - 6} textAnchor="middle" fontSize="12" fill="var(--axis)">{t('x')}</text>
          <text transform={`translate(12 ${(m.t + h - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--axis)">{t('y')}</text>
          <line x1={X(0)} y1={Y(0)} x2={X(diagEnd)} y2={Y(diagEnd)} stroke="var(--axis)" strokeWidth="1.5" strokeDasharray="5 4" />
          {w >= 560 && <text x={m.l + 8} y={m.t + 14} textAnchor="start" fontSize="11" fill="var(--axis)">{t('above')}</text>}
          {w >= 560 && <text x={w - m.r - 6} y={m.t + 14} textAnchor="end" fontSize="11" fill="var(--axis)">{t('below')}</text>}
          {rows.map((r) => {
            const x = X(r.leadHours);
            const a = Y(Math.min(r.todayHours, maxY)), b = Y(Math.min(r.madounHours, maxY));
            const on = hover?.shipmentId === r.shipmentId;
            return (
              <g key={r.shipmentId} opacity={hover && !on ? 0.35 : 1}>
                <line x1={x} x2={x} y1={a} y2={b} stroke="var(--b)" strokeWidth={on ? 1.6 : 1} opacity="0.45" />
                <circle cx={x} cy={a} r={on ? 4.2 : 3} fill="none" stroke="var(--b)" strokeWidth="1.4" />
                <circle cx={x} cy={b} r={on ? 4.4 : 3.2} fill="var(--m)" />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 min-h-[3em] text-sm text-muted" aria-hidden="true">
        {hover ? (
          <span style={{ color: 'var(--ink)' }}>
            <span className="mono" dir="ltr">{hover.shipmentId}</span>{' '}
            <span style={{ color: LANE_COLOR[hover.lane as Lane] }}>{t(hover.lane as Lane)}</span>.{' '}
            {t('read', { lead: f.hours(hover.leadHours), today: f.hours(hover.todayHours), madoun: f.hours(hover.madounHours) })}
          </span>
        ) : t('hint')}
      </p>
    </div>
  );
}
