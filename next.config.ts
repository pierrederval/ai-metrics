import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  logging: {
    incomingRequests: { ignore: [/\/invitations\//, /\/api\/auth\//] },
    serverFunctions: false,
  },
  async headers() {
    return [
      {
        source: '/invitations/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      { source: '/api/auth/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};
export default config;
