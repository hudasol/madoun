import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { LocaleProvider } from '@/lib/i18n';
import { MadounProvider } from '@/lib/store';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Madoun · مدوّن',
  description:
    'A shared shipment file for faster, pre-arrival customs clearance. Check once, reuse everywhere, review in parallel, with an owner for every delay.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <MadounProvider>
            <Shell>{children}</Shell>
          </MadounProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
