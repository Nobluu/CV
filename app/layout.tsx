import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
// import PWAStatus from './components/PWAStatus'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SmartGen CV Maker - AI-Powered Resume Builder',
  description: 'Create professional CVs with AI assistance. Multiple templates available.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CVMaker',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icon-32x32.png',
    shortcut: '/favicon.ico',
    apple: '/icon-152x152.png',
  },
}

export const viewport = {
  themeColor: '#2563eb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* <link rel="manifest" href="/manifest.json" /> */}
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CVMaker" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
          {/* <PWAStatus /> */}
        </Providers>
      </body>
    </html>
  )
}
