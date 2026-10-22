import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import './globals.css';
import './wow-mean.css';
export const metadata: Metadata = {
  title: 'Wow Mean! — Cipta | Kongsi | Undi',
  description:
    'Bengkel kreativiti interaktif untuk guru. Cipta karya dengan AI, kongsi inspirasi dan undi bersama.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
