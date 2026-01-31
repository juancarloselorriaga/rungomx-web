import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const distDir = process.env.NODE_ENV === 'test' ? '.next-test' : undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  ...(distDir ? { distDir } : {}),
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
