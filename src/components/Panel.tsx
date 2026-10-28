import type { ReactNode } from 'react';

export function Panel({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2.5">
          {title && <h2 className="text-[0.98rem]">{title}</h2>}
          {aside && <div className="text-muted text-sm">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageTitle({ title, intro }: { title: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-5 border-b border-line pb-4">
      <h1>{title}</h1>
      {intro && <p className="text-muted mt-1.5 max-w-[72ch]">{intro}</p>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
