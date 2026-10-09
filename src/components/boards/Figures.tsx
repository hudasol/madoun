import type { ReactNode } from 'react';

/** A quiet row of labelled figures. Plain definition list, no cards. */
export function Figures({ items }: { items: { label: ReactNode; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 border-y border-line py-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(10.5rem, 1fr))' }}>
      {items.map((it, i) => (
        <div key={i}>
          <dt className="text-sm text-muted">{it.label}</dt>
          <dd className="mt-0.5 text-[1.6rem] font-semibold leading-tight tabular-nums">{it.value}</dd>
          {it.note && <dd className="mt-0.5 text-sm text-muted">{it.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Modelled({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-[3px] border border-line px-1.5 py-px align-middle text-[0.78rem] font-medium text-muted">{children}</span>
  );
}
