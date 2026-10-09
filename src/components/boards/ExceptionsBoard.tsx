'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { ExceptionKind } from '@/engine';
import { ESCALATE_EVERY_HOURS } from '@/engine';
import { Loading, PageTitle, Panel } from '@/components/Panel';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Figures } from './Figures';
import { KIND_ORDER, useLabels } from './labels';

const T = {
  en: {
    title: 'Exceptions',
    intro: 'Every delay has one named owner and a running clock. When a clock passes a threshold, the delay moves up a level until someone acts.',
    open: 'Open exceptions', byKind: 'By kind', mostHeld: 'Holding the most', none: 'None',
    filters: 'Filters', kind: 'Kind', authority: 'Authority', minLevel: 'Minimum level', all: 'All', levelN: 'Level {n} or higher',
    listCaption: 'Open exceptions, longest-running first', shipment: 'Shipment', owner: 'Owner', detail: 'What is stuck', clock: 'Clock', level: 'Escalation', action: 'Action',
    level0: 'Level {n}', level3: 'Level {n}', ladder: 'Escalation level {n} of 3. A delay moves up a level every {h} hours.',
    resolve: 'Resolve', roleNo: 'Your role cannot resolve this item', cancel: 'Cancel', confirm: 'Confirm resolution', note: 'Resolution note', notePh: 'What was done, and by whom',
    noteNeeded: 'Write a short note so the record shows why this was closed.',
    resolved: 'Resolved: {kind} on {id}. It is now in the audit trail with your note.',
    noMatch: 'No exceptions match these filters.', clear: 'Clear filters',
    emptyTitle: 'No delay is currently without an owner.',
    emptyBody: 'Nothing has passed its clock at this moment. Move the time slider in the header to an earlier point to find busier moments, or press Latest to return.',
    keyTitle: 'What each kind means',
    k_idle: 'A reviewer started but has not finished, and the authority’s own committed time has passed.',
    k_missing: 'A document that the goods require was never submitted, so the review cannot start.',
    k_expiring: 'A reusable certificate on file will lapse before the shipment arrives.',
    k_conflict: 'Two authorities rate the shipment in different lanes and no officer has decided.',
    k_handoff: 'Everything a review needs is ready but nobody at the authority has picked it up.',
    scroll: 'Table scrolls sideways on narrow screens',
  },
  ar: {
    title: 'الاستثناءات',
    intro: 'لكل تأخير مسؤول واحد معلوم وساعة تعمل. وعندما تتجاوز الساعة حداً معيناً يرتفع التأخير مستوىً حتى يتحرك أحد.',
    open: 'استثناءات مفتوحة', byKind: 'حسب النوع', mostHeld: 'الأكثر تحمّلاً للتأخير', none: 'لا يوجد',
    filters: 'التصفية', kind: 'النوع', authority: 'الجهة', minLevel: 'أدنى مستوى تصعيد', all: 'الكل', levelN: 'المستوى {n} فما فوق',
    listCaption: 'الاستثناءات المفتوحة، الأطول مدة أولاً', shipment: 'الشحنة', owner: 'المسؤول', detail: 'ما الذي تعطّل', clock: 'الساعة', level: 'التصعيد', action: 'الإجراء',
    level0: 'المستوى {n}', level3: 'المستوى {n}', ladder: 'مستوى التصعيد {n} من 3. يرتفع التأخير مستوىً كل {h} ساعة.',
    resolve: 'حلّ', roleNo: 'دورك لا يتيح حل هذا البند', cancel: 'إلغاء', confirm: 'تأكيد الحل', note: 'ملاحظة الحل', notePh: 'ما الذي تم ومن قام به',
    noteNeeded: 'اكتب ملاحظة قصيرة ليظهر في السجل سبب الإغلاق.',
    resolved: 'تم الحل: {kind} للشحنة {id}. أصبح في سجل التدقيق مع ملاحظتك.',
    noMatch: 'لا توجد استثناءات تطابق هذه المعايير.', clear: 'مسح المعايير',
    emptyTitle: 'لا يوجد حالياً أي تأخير بلا مسؤول.',
    emptyBody: 'لم تتجاوز أي ساعة حدّها في هذه اللحظة. حرّك شريط الزمن في الأعلى إلى وقت أسبق لتجد لحظات أكثر ازدحاماً، أو اضغط «الأحدث» للعودة.',
    keyTitle: 'معنى كل نوع',
    k_idle: 'بدأ مراجع العمل ولم ينهِه، وتجاوز الوقت الذي التزمت به الجهة.',
    k_missing: 'مستند تتطلبه البضائع لم يُقدَّم، فلا يمكن بدء المراجعة.',
    k_expiring: 'شهادة قابلة لإعادة الاستخدام ستنتهي صلاحيتها قبل وصول الشحنة.',
    k_conflict: 'جهتان تصنفان الشحنة في مسارين مختلفين ولم يحسم ضابط الأمر.',
    k_handoff: 'كل ما تحتاجه المراجعة جاهز ولم يتسلمها أحد في الجهة.',
    scroll: 'يمكن تمرير الجدول أفقياً على الشاشات الضيقة',
  },
};

const KEY_TEXT: Record<ExceptionKind, 'k_idle' | 'k_missing' | 'k_expiring' | 'k_conflict' | 'k_handoff'> = {
  'idle-review': 'k_idle', 'missing-evidence': 'k_missing', 'evidence-expiring': 'k_expiring', 'authority-conflict': 'k_conflict', 'unowned-handoff': 'k_handoff',
};

function Ladder({ level }: { level: number }) {
  const t = useT(T);
  const f = useFormat();
  const n = Math.min(level, 3);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={t('ladder', { n: f.number(n), h: ESCALATE_EVERY_HOURS })}>
      <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 9} y={10 - i * 3} width="7" height={4 + i * 3} fill={i < n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" opacity={i < n ? 1 : 0.45} />
        ))}
      </svg>
      <span className="text-sm">{level >= 3 ? t('level3', { n: `${f.number(3)}+` }) : t('level0', { n: f.number(level) })}</span>
    </span>
  );
}

export function ExceptionsBoard() {
  const s = useStore();
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const L = useLabels();
  const uid = useId();
  const [kind, setKind] = useState('all');
  const [auth, setAuth] = useState('all');
  const [minLevel, setMinLevel] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [message, setMessage] = useState('');

  const all = s.exceptions;
  const rows = useMemo(
    () => all.filter((e) => (kind === 'all' || e.kind === kind) && (auth === 'all' || e.authorityId === auth) && e.escalationLevel >= minLevel),
    [all, kind, auth, minLevel],
  );

  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return KIND_ORDER.map((k) => ({ k, n: m.get(k) ?? 0 })).filter((x) => x.n > 0);
  }, [all]);

  const top = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) m.set(e.ownerId, (m.get(e.ownerId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [all]);

  const authorityIds = useMemo(() => [...new Set(all.map((e) => e.authorityId).filter((x): x is string => !!x))], [all]);

  if (!s.ready) return <Loading />;

  const submit = (id: string, k: string, shipmentId: string) => {
    if (!note.trim()) {
      setNoteError(true);
      return;
    }
    s.resolveException(id, note.trim());
    setMessage(t('resolved', { kind: L.kind(k), id: shipmentId }));
    setOpenId(null);
    setNote('');
    setNoteError(false);
  };

  return (
    <div>
      <PageTitle title={t('title')} intro={t('intro')} />
      <p role="status" aria-live="polite" className={message ? 'mb-4 rounded-[3px] border border-line bg-panel2 px-3 py-2 text-sm' : 'sr-only'}>{message}</p>

      {all.length === 0 ? (
        <Panel>
          <div className="max-w-[60ch]">
            <h2 className="text-[1.1rem]">{t('emptyTitle')}</h2>
            <p className="mt-2 text-muted">{t('emptyBody')}</p>
          </div>
        </Panel>
      ) : (
        <>
          <Figures
            items={[
              { label: t('open'), value: f.number(all.length) },
              {
                label: t('byKind'),
                value: <span className="text-base font-normal">{byKind.map((x, i) => (<span key={x.k}>{i > 0 && ', '}<span className="tabular-nums font-semibold">{f.number(x.n)}</span> {L.kind(x.k).toLowerCase()}</span>))}</span>,
              },
              { label: t('mostHeld'), value: <span className="text-base font-semibold">{top ? L.owner(top[0]) : t('none')}</span>, note: top ? `${f.number(top[1])} / ${f.number(all.length)}` : undefined },
            ]}
          />

          <form className="mt-6 flex flex-wrap items-end gap-4" onSubmit={(e) => e.preventDefault()} aria-label={t('filters')}>
            <div>
              <label htmlFor={`${uid}k`} className="block text-sm text-muted">{t('kind')}</label>
              <select id={`${uid}k`} className="btn mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">{t('all')}</option>
                {KIND_ORDER.map((k) => <option key={k} value={k}>{L.kind(k)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}a`} className="block text-sm text-muted">{t('authority')}</label>
              <select id={`${uid}a`} className="btn mt-1" value={auth} onChange={(e) => setAuth(e.target.value)}>
                <option value="all">{t('all')}</option>
                {authorityIds.map((a) => <option key={a} value={a}>{L.authority(a)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}l`} className="block text-sm text-muted">{t('minLevel')}</label>
              <select id={`${uid}l`} className="btn mt-1" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
                <option value={0}>{t('all')}</option>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{t('levelN', { n: f.number(n) })}</option>)}
              </select>
            </div>
          </form>

          <div className="panel relative mt-4 overflow-x-auto">
            <table className="table-clean min-w-[860px]">
              <caption className="sr-only">{t('listCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('kind')}</th>
                  <th scope="col">{t('shipment')}</th>
                  <th scope="col">{t('authority')}</th>
                  <th scope="col">{t('owner')}</th>
                  <th scope="col">{t('detail')}</th>
                  <th scope="col">{t('clock')}</th>
                  <th scope="col">{t('level')}</th>
                  <th scope="col">{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const isOpen = openId === e.id;
                  return (
                    <tr key={e.id}>
                      <td className="font-medium">{L.kind(e.kind)}</td>
                      <td><Link href={`/shipments/${e.shipmentId}`} className="mono whitespace-nowrap underline underline-offset-2">{e.shipmentId}</Link></td>
                      <td>{e.authorityId ? L.authority(e.authorityId) : <span className="text-muted">{t('none')}</span>}</td>
                      <td>{L.owner(e.ownerId)}</td>
                      <td className="max-w-[34ch]">{bi(e.detail, e.detailAr)}</td>
                      <td className="whitespace-nowrap tabular-nums">{f.hours(e.clockHours)}</td>
                      <td><Ladder level={e.escalationLevel} /></td>
                      <td className="min-w-[15rem]">
                        {!isOpen ? (
                          <button type="button" className="btn" aria-expanded="false" disabled={!s.can('resolve-exception', e.authorityId)} title={s.can('resolve-exception', e.authorityId) ? undefined : t('roleNo')} onClick={() => { setOpenId(e.id); setNote(''); setNoteError(false); }}>{t('resolve')}</button>
                        ) : (
                          <div>
                            <label htmlFor={`${uid}n${e.id}`} className="block text-sm text-muted">{t('note')}</label>
                            <input
                              id={`${uid}n${e.id}`}
                              autoFocus
                              className="mt-1 w-full rounded-[3px] border border-line bg-canvas px-2 py-1.5"
                              value={note}
                              placeholder={t('notePh')}
                              aria-invalid={noteError}
                              aria-describedby={noteError ? `${uid}err` : undefined}
                              onChange={(ev) => setNote(ev.target.value)}
                              onKeyDown={(ev) => { if (ev.key === 'Enter') submit(e.id, e.kind, e.shipmentId); if (ev.key === 'Escape') setOpenId(null); }}
                            />
                            {noteError && <p id={`${uid}err`} className="mt-1 text-sm" style={{ color: 'var(--red)' }}>{t('noteNeeded')}</p>}
                            <div className="mt-2 flex gap-2">
                              <button type="button" className="btn btn-primary" onClick={() => submit(e.id, e.kind, e.shipmentId)}>{t('confirm')}</button>
                              <button type="button" className="btn" onClick={() => setOpenId(null)}>{t('cancel')}</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="p-4">
                <p className="text-muted">{t('noMatch')}</p>
                <button type="button" className="btn mt-2" onClick={() => { setKind('all'); setAuth('all'); setMinLevel(0); }}>{t('clear')}</button>
              </div>
            )}
          </div>
        </>
      )}

      <section className="mt-8 max-w-[68ch]" aria-labelledby={`${uid}key`}>
        <h2 id={`${uid}key`} className="text-[1.1rem]">{t('keyTitle')}</h2>
        <dl className="mt-3 space-y-3">
          {KIND_ORDER.map((k) => (
            <div key={k}>
              <dt className="font-medium">{L.kind(k)}</dt>
              <dd className="text-muted">{t(KEY_TEXT[k])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
