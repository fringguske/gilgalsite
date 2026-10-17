import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This project is an API-only Next.js app: every route lives under src/app/api.
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['postgres', 'bcryptjs'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
