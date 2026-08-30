import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lexync — Keep the words you choose',
  description: 'Deliberately capture language on the web, synchronize it, and practise offline on iPhone.',
  metadataBase: new URL('https://lexync-web.vercel.app'),
  icons: {
    icon: { url: '/brand/favicon.png', sizes: '48x48', type: 'image/png' },
    apple: { url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  openGraph: {
    type: 'website',
    title: 'Lexync — Keep the words you choose',
    description: 'Deliberately capture language on the web, synchronize it, and practise offline on iPhone.',
    siteName: 'Lexync',
    images: [{
      url: '/brand/social-preview.png',
      width: 1200,
      height: 630,
      alt: 'Lexync — Keep the words you choose',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lexync — Keep the words you choose',
    description: 'Deliberately capture language on the web, synchronize it, and practise offline on iPhone.',
    images: ['/brand/social-preview.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
