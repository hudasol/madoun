'use client';

import Link from 'next/link';
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { verifyChain, ms, type EvidenceReceipt } from '@/engine';
import { Loading, PageTitle } from '@/components/Panel';
import { Stamp, type StampTone } from '@/components/Stamp';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Figures } from './Figures';
import { useLabels } from './labels';
import { Pager } from './Pager';

const T = {
  en: {
    title: 'Evidence ledger',
    idea: 'Check once, trust until it expires. The custodian authority keeps the document; Madoun keeps only the receipt: who verified what, for which goods, until when. Another authority can accept that receipt instead of asking again, if its sharing rules allow.',
    receipts: 'Receipts', reuse: 'Reuse events', cross: 'Reuse across authorities', crossNote: '{n} of {m} reuse events', integrity: 'Ledger integrity',
    ok: 'Chain intact', broken: 'Chain broken at receipt {n}', head: 'Head {h}',
    filter: 'Show', f_all: 'All receipts', f_soon: 'Expiring within 72 hours', f_expired: 'Expired', f_revoked: 'Revoked', f_own: 'Shared only with own authority', f_most: 'Most reused',
    count: '{n} receipts shown', caption: 'Evidence receipts', receipt: 'Receipt', scope: 'Scope', method: 'Method', sharedWith: 'Shared with', reuses: 'Times reused',
    allAuth: 'All authorities', shipmentScope: 'This shipment only', traderScope: 'All goods of {trader}', productScope: 'Products of {trader}', hs6: 'HS {codes}', more: '+{n} more',
    open: 'Show details', close: 'Hide details', reuseLog: 'Where it was reused', none: 'Not yet reused.', shipment: 'Shipment', acceptedBy: 'Accepted by', requirement: 'Requirement', at: 'When',
    hash: 'Hash', prev: 'Previous hash', revokedBecause: 'Revoked: {r}', state_valid: 'valid', state_soon: 'expires soon', state_expired: 'expired', state_revoked: 'revoked',
    empty: 'No receipts match this filter.', focus: 'Showing one receipt from a link.', showAll: 'Show all receipts', issuer: 'Issued by', summary: 'What was verified',
  },
  ar: {
    title: 'سجل الأدلة',
    idea: 'يُفحص الدليل مرة واحدة ويُعتمد حتى تنتهي صلاحيته. تحتفظ الجهة الحافظة بالمستند، ويحتفظ مدوّن بالإيصال فقط: من تحقق من ماذا، ولأي بضائع، وحتى متى. ويمكن لجهة أخرى قبول الإيصال بدل السؤال من جديد، إذا سمحت قواعد المشاركة.',
    receipts: 'الإيصالات', reuse: 'مرات إعادة الاستخدام', cross: 'إعادة الاستخدام بين الجهات', crossNote: '{n} من {m} مرة', integrity: 'سلامة السجل',
    ok: 'السلسلة سليمة', broken: 'السلسلة منقطعة عند الإيصال {n}', head: 'الرأس {h}',
    filter: 'عرض', f_all: 'كل الإيصالات', f_soon: 'تنتهي خلال 72 ساعة', f_expired: 'منتهية', f_revoked: 'ملغاة', f_own: 'مشتركة مع الجهة نفسها فقط', f_most: 'الأكثر إعادة استخدام',
    count: 'تم عرض {n} إيصال', caption: 'إيصالات الأدلة', receipt: 'الإيصال', scope: 'النطاق', method: 'الطريقة', sharedWith: 'مشترك مع', reuses: 'مرات إعادة الاستخدام',
    allAuth: 'كل الجهات', shipmentScope: 'هذه الشحنة فقط', traderScope: 'كل بضائع {trader}', productScope: 'منتجات {trader}', hs6: 'رمز النظام المنسق {codes}', more: '+{n} أخرى',
    open: 'عرض التفاصيل', close: 'إخفاء التفاصيل', reuseLog: 'أين أُعيد استخدامه', none: 'لم يُعد استخدامه بعد.', shipment: 'الشحنة', acceptedBy: 'قبلته', requirement: 'المتطلب', at: 'الوقت',
    hash: 'البصمة', prev: 'البصمة السابقة', revokedBecause: 'ملغى: {r}', state_valid: 'ساري', state_soon: 'ينتهي قريباً', state_expired: 'منتهي', state_revoked: 'ملغى',
    empty: 'لا توجد إيصالات تطابق هذا الخيار.', focus: 'يتم عرض إيصال واحد من رابط.', showAll: 'عرض كل الإيصالات', issuer: 'الجهة المصدرة', summary: 'ما الذي تم التحقق منه',
  },
};

type Filter = 'all' | 'soon' | 'expired' | 'revoked' | 'own' | 'most';
const FILTERS: Filter[] = ['all', 'soon', 'expired', 'revoked', 'own', 'most'];
const PAGE = 30;
const H72 = 72 * 3_600_000;

function Hash({ value }: { value: string }) {
  return <span className="mono break-all text-sm" dir="ltr" title={value}>{value.slice(0, 16)}…{value.slice(-6)}</span>;
}

export function EvidenceBoard() {
  const s = useStore();
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const L = useLabels();
  const uid = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('receipt');
      if (id) { setFocusId(id); setOpenId(id); }
    } catch { /* ignore */ }
  }, []);

  const receipts = s.world?.receipts;
  const atMs = ms(s.at || new Date().toISOString());

  const state = (r: EvidenceReceipt): 'valid' | 'soon' | 'expired' | 'revoked' => {
    if (r.status === 'revoked') return 'revoked';
    const u = ms(r.validUntil);
    if (u <= atMs) return 'expired';
    if (u - atMs <= H72) return 'soon';
    return 'valid';
  };

  const stats = useMemo(() => {
    const list = receipts ?? [];
    let reuse = 0, cross = 0;
    for (const r of list) for (const e of r.reuseLog) { reuse++; if (e.acceptedByAuthorityId !== r.verifiedBy) cross++; }
    const chain = verifyChain(list);
    return { reuse, cross, chain, head: list.length ? list[list.length - 1].hash : '' };
  }, [receipts]);

  const rows = useMemo(() => {
    let list = [...(receipts ?? [])].reverse();
    if (focusId) return list.filter((r) => r.id === focusId);
    const st = (r: EvidenceReceipt) => {
      if (r.status === 'revoked') return 'revoked';
      const u = ms(r.validUntil);
      return u <= atMs ? 'expired' : u - atMs <= H72 ? 'soon' : 'valid';
    };
    if (filter === 'soon') list = list.filter((r) => st(r) === 'soon');
    else if (filter === 'expired') list = list.filter((r) => st(r) === 'expired');
    else if (filter === 'revoked') list = list.filter((r) => st(r) === 'revoked');
    else if (filter === 'own') list = list.filter((r) => r.sharedWith !== 'all');
    else if (filter === 'most') list = list.filter((r) => r.reuseLog.length > 0).sort((a, b) => b.reuseLog.length - a.reuseLog.length);
    return list;
  }, [receipts, filter, focusId, atMs]);

  if (!s.ready || !receipts) return <Loading />;

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  const scopeText = (r: EvidenceReceipt) => {
    const sc = r.scope;
    const trader = sc.traderId ? L.trader(sc.traderId) : '';
    if (sc.level === 'shipment') return <Link href={`/shipments/${sc.shipmentId}`} className="mono whitespace-nowrap underline underline-offset-2">{sc.shipmentId}</Link>;
    const hs = sc.hs6 ?? [];
    return (
      <div>
        <div>{sc.level === 'trader' ? t('traderScope', { trader }) : t('productScope', { trader })}</div>
        {hs.length > 0 && (
          <div className="mono text-sm text-muted" dir="ltr">
            {hs.slice(0, 3).join(', ')}{hs.length > 3 && ` ${t('more', { n: f.number(hs.length - 3) })}`}
          </div>
        )}
      </div>
    );
  };

  const stateLabel = (r: EvidenceReceipt) => t(`state_${state(r)}` as 'state_valid');
  const tone = (r: EvidenceReceipt): StampTone => { const x = state(r); return x === 'valid' ? 'verified' : x === 'soon' ? 'warn' : 'void'; };

  return (
    <div>
      <PageTitle title={t('title')} intro={t('idea')} />
      <Figures
        items={[
          { label: t('receipts'), value: f.number(receipts.length) },
          { label: t('reuse'), value: f.number(stats.reuse) },
          { label: t('cross'), value: stats.reuse ? f.percent((stats.cross / stats.reuse) * 100) : '–', note: t('crossNote', { n: f.number(stats.cross), m: f.number(stats.reuse) }) },
          {
            label: t('integrity'),
            value: <span className="text-base font-semibold">{stats.chain.valid ? t('ok') : t('broken', { n: f.number((stats.chain.brokenAt ?? 0) + 1) })}</span>,
            note: stats.head ? <span>{t('head', { h: '' })}<span className="mono" dir="ltr">{stats.head.slice(0, 10)}</span></span> : undefined,
          },
        ]}
      />

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`${uid}f`} className="block text-sm text-muted">{t('filter')}</label>
          <select id={`${uid}f`} className="btn mt-1" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); setFocusId(null); }}>
            {FILTERS.map((x) => <option key={x} value={x}>{t(`f_${x}` as 'f_all')}</option>)}
          </select>
        </div>
        <p className="text-sm text-muted" aria-live="polite">{t('count', { n: f.number(rows.length) })}</p>
        {focusId && (
          <p className="text-sm">{t('focus')} <button type="button" className="underline underline-offset-2" onClick={() => setFocusId(null)}>{t('showAll')}</button></p>
        )}
      </div>

      <div className="panel relative mt-3 overflow-x-auto">
        <table className="table-clean min-w-[900px]">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('receipt')}</th>
              <th scope="col">{t('scope')}</th>
              <th scope="col">{t('method')}</th>
              <th scope="col">{t('sharedWith')}</th>
              <th scope="col">{t('reuses')}</th>
              <th scope="col"><span className="sr-only">{t('open')}</span></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const open = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className="py-3">
                      <Stamp authority={L.authority(r.verifiedBy)} label={L.evidenceType(r.type)} validUntil={r.validUntil} tone={tone(r)} note={stateLabel(r)} />
                      <div className="mt-2 text-sm text-muted">{stateLabel(r)}</div>
                    </td>
                    <td className="max-w-[26ch]">{scopeText(r)}</td>
                    <td>{L.method(r.method)}</td>
                    <td className="max-w-[24ch]">
                      {r.sharedWith === 'all' ? t('allAuth') : r.sharedWith.map((a) => L.authority(a)).join(bi(', ', '، '))}
                    </td>
                    <td className="tabular-nums">{f.number(r.reuseLog.length)}</td>
                    <td>
                      <button type="button" className="btn" aria-expanded={open} aria-controls={`${uid}d${r.id}`} onClick={() => setOpenId(open ? null : r.id)}>
                        {open ? t('close') : t('open')}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} id={`${uid}d${r.id}`} className="bg-panel2">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <h3 className="text-base">{t('summary')}</h3>
                            <p className="mt-1">{bi(r.summary, r.summaryAr)}</p>
                            <p className="mt-1 text-sm text-muted">{t('issuer')}: <span className="mono" dir="ltr">{r.issuer}</span></p>
                            {r.status === 'revoked' && <p className="mt-1 text-sm" style={{ color: 'var(--red)' }}>{t('revokedBecause', { r: r.revokedReason ?? '' })}</p>}
                            <dl className="mt-3 space-y-1 text-sm">
                              <div><dt className="inline text-muted">{t('hash')}: </dt><dd className="inline"><Hash value={r.hash} /></dd></div>
                              <div><dt className="inline text-muted">{t('prev')}: </dt><dd className="inline"><Hash value={r.prevHash} /></dd></div>
                            </dl>
                          </div>
                          <div>
                            <h3 className="text-base">{t('reuseLog')}</h3>
                            {r.reuseLog.length === 0 ? (
                              <p className="mt-1 text-muted">{t('none')}</p>
                            ) : (
                              <div className="mt-1 max-h-64 overflow-auto">
                                <table className="table-clean text-sm">
                                  <thead><tr><th scope="col">{t('shipment')}</th><th scope="col">{t('acceptedBy')}</th><th scope="col">{t('requirement')}</th><th scope="col">{t('at')}</th></tr></thead>
                                  <tbody>
                                    {r.reuseLog.map((e, i) => (
                                      <tr key={i}>
                                        <td><Link href={`/shipments/${e.shipmentId}`} className="mono whitespace-nowrap underline underline-offset-2">{e.shipmentId}</Link></td>
                                        <td>{L.authority(e.acceptedByAuthorityId)}</td>
                                        <td>{bi(s.directory?.requirementById[e.requirementId]?.label ?? e.requirementId, s.directory?.requirementById[e.requirementId]?.labelAr)}</td>
                                        <td className="whitespace-nowrap">{f.dateTime(e.at)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
      <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
    </div>
  );
}
