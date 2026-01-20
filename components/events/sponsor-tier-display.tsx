import Image from 'next/image';

import type { SponsorTier, SponsorDisplaySize } from '@/lib/events/website/types';
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

/**
 * Logo heights by display size
 */
const LOGO_HEIGHTS: Record<SponsorDisplaySize, number> = {
  xl: 64,
  lg: 52,
  md: 44,
  sm: 36,
};

interface SponsorTierDisplayProps {
  tier: SponsorTier;
  mediaUrls?: Map<string, string>;
}

export function SponsorTierDisplay({ tier, mediaUrls }: SponsorTierDisplayProps) {
  const sortedSponsors = [...(tier.sponsors ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  if (sortedSponsors.length === 0) {
    return null;
  }

  const logoHeight = LOGO_HEIGHTS[tier.displaySize ?? 'md'];

  return (
    <div className="space-y-3">
      {tier.name && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {tier.name}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-6">
        {sortedSponsors.map((sponsor) => {
          const logoUrl = mediaUrls?.get(sponsor.logoMediaId);
          if (!logoUrl) return null;

          const hasSafeUrl = isSafeExternalUrl(sponsor.websiteUrl);

          const logoContent = (
            <div
              className={cn(
                'relative flex items-center justify-center',
                'grayscale opacity-60 transition-all duration-300',
                'hover:grayscale-0 hover:opacity-100',
                hasSafeUrl && 'cursor-pointer',
              )}
              style={{
                height: logoHeight,
                width: logoHeight * 2.2,
              }}
            >
              <Image
                src={logoUrl}
                alt={sponsor.name}
                fill
                sizes="140px"
                className="object-contain dark:invert"
              />
            </div>
          );

          if (hasSafeUrl) {
            return (
              <a
                key={sponsor.id}
                href={sponsor.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={sponsor.name}
              >
                {logoContent}
              </a>
            );
          }

          return (
            <div key={sponsor.id} title={sponsor.name}>
              {logoContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
