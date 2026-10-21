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
export const metadata: Metadata = {
  title: 'WOW #1 — Big ideas. Tiny stickers.',
  description:
    'A live creativity workshop for teachers. Make a prompt, create a sticker, and cheer each other on.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
