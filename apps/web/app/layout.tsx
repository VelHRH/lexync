import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import './globals.css';
import { themeCookie } from '../lib/themePreference';

const lexyncSans = Atkinson_Hyperlegible_Next({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--web-font',
});

export const metadata: Metadata = {
  title: 'Lexync - Keep the words you choose',
  description: 'Deliberately capture language on the web, synchronize it, and practise offline on Android.',
  metadataBase: new URL('https://lexync-web.vercel.app'),
  icons: {
    icon: { url: '/brand/favicon.png', sizes: '48x48', type: 'image/png' },
    apple: { url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  openGraph: {
    type: 'website',
    title: 'Lexync - Keep the words you choose',
    description: 'Deliberately capture language on the web, synchronize it, and practise offline on Android.',
    siteName: 'Lexync',
    images: [{
      url: '/brand/social-preview.png',
      width: 1200,
      height: 630,
      alt: 'Lexync - Keep the words you choose',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lexync - Keep the words you choose',
    description: 'Deliberately capture language on the web, synchronize it, and practise offline on Android.',
    images: ['/brand/social-preview.png'],
  },
};

const stampTheme = `(function(){try{var m=document.cookie.match(/(?:^|; )${themeCookie}=([^;]*)/);var t=m?decodeURIComponent(m[1]):'';if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={lexyncSans.variable}>
      <head><script dangerouslySetInnerHTML={{ __html: stampTheme }} /></head>
      <body>{children}</body>
    </html>
  );
}
