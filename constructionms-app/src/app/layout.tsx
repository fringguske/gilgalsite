import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@/client/index.css'

/** The former index.html head. */
export const metadata: Metadata = {
  title: 'Construction Management System',
  description: 'Construction management system for project, material, procurement, inventory and financial control.',
  robots: { index: true, follow: true },
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
  alternates: { canonical: 'https://gilgal.duckdns.org/' },
  openGraph: {
    type: 'website',
    title: 'Construction Management System',
    description: 'Project, material, procurement, inventory and financial control.',
    url: 'https://gilgal.duckdns.org/',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#172321',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
