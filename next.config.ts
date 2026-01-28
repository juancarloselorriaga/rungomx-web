import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const distDir = process.env.RUNGOMX_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: '**.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
