/* eslint-disable @next/next/no-page-custom-font */
import type {Metadata} from 'next';
import { Toaster } from "@/components/ui/toaster"
import './globals.css';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'FreshType',
  description: 'Free online typing test to measure WPM, CPM, accuracy and errors. Practice SSC CHSL typing with 100/200/400/800 word passages',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', !!isDark);
  } catch (_) {}
})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-code antialiased" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
