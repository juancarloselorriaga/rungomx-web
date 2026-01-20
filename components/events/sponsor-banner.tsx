'use client';

import Image from 'next/image';

import type { SponsorsSection, Sponsor } from '@/lib/events/website/types';
import { cn } from '@/lib/utils';

/**
 * Validates that a URL uses a safe protocol (http/https only).
 */
function isSafeExternalUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const LOGO_HEIGHT = 36; // Consistent height for all logos

interface SponsorLogoProps {
  sponsor: Sponsor;
  logoUrl: string | undefined;
}

function SponsorLogo({ sponsor, logoUrl }: SponsorLogoProps) {
  if (!logoUrl) return null;

  const hasSafeUrl = isSafeExternalUrl(sponsor.websiteUrl);

  const logoContent = (
    <div
      className={cn(
        'relative flex-shrink-0 flex items-center justify-center',
        // Grayscale + reduced opacity by default, color on hover
        'grayscale opacity-60 transition-all duration-300',
        'hover:grayscale-0 hover:opacity-100',
        hasSafeUrl && 'cursor-pointer',
      )}
      style={{
        height: LOGO_HEIGHT,
        width: LOGO_HEIGHT * 2.5,
      }}
    >
      <Image
        src={logoUrl}
        alt={sponsor.name}
        fill
        sizes="120px"
        className="object-contain dark:invert"
      />
    </div>
  );

  if (hasSafeUrl) {
    return (
      <a
        href={sponsor.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={sponsor.name}
      >
        {logoContent}
      </a>
    );
  }

  return <div title={sponsor.name}>{logoContent}</div>;
}

interface SponsorBannerProps {
  sponsors: SponsorsSection;
  mediaUrls: Map<string, string>;
}

export function SponsorBanner({ sponsors, mediaUrls }: SponsorBannerProps) {
  // Flatten all sponsors from all tiers into a single list, sorted by tier order then sponsor order
  const allSponsors: Sponsor[] = [];

  const sortedTiers = [...sponsors.tiers].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const tier of sortedTiers) {
    const tierSponsors = [...(tier.sponsors ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    allSponsors.push(...tierSponsors);
  }

  // Filter to only sponsors with valid logos
  const sponsorsWithLogos = allSponsors.filter((sponsor) =>
    mediaUrls.has(sponsor.logoMediaId),
  );

  if (sponsorsWithLogos.length === 0) return null;

  const useMarquee = sponsorsWithLogos.length >= 8;

  // Calculate marquee duration based on number of sponsors
  const marqueeDuration = Math.max(25, sponsorsWithLogos.length * 3);

  return (
    <div className="border-t border-border/30 py-5">
      <div className="container mx-auto max-w-7xl px-4">
        {useMarquee ? (
          <div
            className="relative overflow-hidden marquee-fade-edges"
            style={{ '--marquee-duration': `${marqueeDuration}s` } as React.CSSProperties}
          >
            <div className="animate-marquee flex items-center gap-10">
              {/* Duplicate for seamless loop */}
              {[...sponsorsWithLogos, ...sponsorsWithLogos].map((sponsor, index) => (
                <SponsorLogo
                  key={`${sponsor.id}-${index}`}
                  sponsor={sponsor}
                  logoUrl={mediaUrls.get(sponsor.logoMediaId)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-none">
            <div className="flex items-center justify-center gap-10 min-w-max">
              {sponsorsWithLogos.map((sponsor) => (
                <SponsorLogo
                  key={sponsor.id}
                  sponsor={sponsor}
                  logoUrl={mediaUrls.get(sponsor.logoMediaId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
