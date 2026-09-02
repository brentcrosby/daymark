import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const socialImage = siteUrl
  ? new URL(
      'og.png',
      siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
    ).toString()
  : undefined;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Daymark — A record of what got done',
  description:
    'A fast, private reverse scheduler for logging how you spent your day.',
  manifest: './manifest.webmanifest',
  icons: { icon: './favicon.svg', apple: './favicon.svg' },
  openGraph: {
    title: 'Daymark — A record of what got done',
    description:
      'A fast, private reverse scheduler for logging how you spent your day.',
    type: 'website',
    images: socialImage
      ? [
          {
            url: socialImage,
            width: 1200,
            height: 630,
            alt: 'Daymark timeline',
          },
        ]
      : undefined,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daymark — A record of what got done',
    description:
      'A fast, private reverse scheduler for logging how you spent your day.',
    images: socialImage ? [socialImage] : undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
