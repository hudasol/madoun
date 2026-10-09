'use client';

import { ms } from '@/engine';

/**
 * One row of the arrival board, drawn as a time line from filing to arrival.
 * The fill is time already spent, ticks are finished reviews, the bar-shaped
 * marker is arrival and the diamond is the modelled release. When release lands
 * after arrival, the gap is hatched. Position uses logical inset so it mirrors in RTL.
 */
export function Track({
  filedAt, eta, at, predictedAt, doneAt,
}: { filedAt: string; eta: string; at: string; predictedAt: string; doneAt: string[] }) {
  const start = ms(filedAt);
  const etaMs = ms(eta);
  const predMs = ms(predictedAt);
  const end = Math.max(etaMs, predMs);
  const span = Math.max(1, end - start);
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const late = predMs > etaMs;
  const now = pos(ms(at));
  const etaPos = pos(etaMs);
  const predPos = pos(predMs);

  return (
    <div className="relative mx-2 h-7" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <div className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-[1px] bg-muted" style={{ insetInlineStart: 0, width: `${now}%` }} />
      {late && (
        <div
          className="absolute top-1/2 h-[9px] -translate-y-1/2 border-y border-ink"
          style={{
            insetInlineStart: `${etaPos}%`,
            width: `${predPos - etaPos}%`,
            backgroundImage: 'repeating-linear-gradient(135deg, var(--ink) 0 1.5px, transparent 1.5px 5px)',
          }}
        />
      )}
      {doneAt.map((d, i) => (
        <span key={i} className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-ink rtl:translate-x-1/2" style={{ insetInlineStart: `${pos(ms(d))}%` }} />
      ))}
      <span className="absolute top-0 h-full w-[3px] -translate-x-1/2 bg-ink rtl:translate-x-1/2" style={{ insetInlineStart: `${etaPos}%` }} />
      <svg
        width="12" height="12" viewBox="0 0 12 12"
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
        style={{ insetInlineStart: `${predPos}%` }}
      >
        <path d="M6 0.5 11.5 6 6 11.5 0.5 6z" fill="var(--canvas)" stroke="var(--ink)" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

export function TrackLegend({ labels }: { labels: { elapsed: string; review: string; arrival: string; release: string } }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted" aria-label="Legend">
      <li className="inline-flex items-center gap-2"><span className="inline-block h-[5px] w-6 bg-muted" />{labels.elapsed}</li>
      <li className="inline-flex items-center gap-2"><span className="inline-block h-3 w-[2px] bg-ink" />{labels.review}</li>
      <li className="inline-flex items-center gap-2"><span className="inline-block h-4 w-[3px] bg-ink" />{labels.arrival}</li>
      <li className="inline-flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.5 11.5 6 6 11.5 0.5 6z" fill="var(--canvas)" stroke="var(--ink)" strokeWidth="1.8" /></svg>
        {labels.release}
      </li>
    </ul>
  );
}
