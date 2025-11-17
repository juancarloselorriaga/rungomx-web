import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Carreras y eventos deportivos en México | SprintMX',
  description:
    'Descubre las mejores carreras en México. Inscripciones en línea, pagos seguros, resultados, rankings, eventos en CDMX y más con SprintMX.',
  keywords: [
    'carreras en México',
    'carreras CDMX',
    'eventos deportivos CDMX',
    'carreras para correr México',
    'inscripciones carreras México',
    '5K CDMX',
    '10K CDMX',
    'maratones México',
  ],
  openGraph: {
    title: 'Carreras y eventos deportivos en México | SprintMX',
    description:
      'Encuentra y organiza carreras en México. Inscripciones, pagos, resultados y rankings en una sola plataforma.',
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/og-home.jpg`,
        width: 1200,
        height: 630,
        alt: 'SprintMX Home - Carreras en México',
      },
    ],
  },
};

export default function Home() {
  return (
    <div className="w-full flex   items-center justify-center">
      <p>
        Home
      </p>
    </div>
  );
}
