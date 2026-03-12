import type { PublicOfficialResultsPageData } from '@/lib/events/results/types';
import type { Metadata } from 'next';

export function resolvePublicOfficialResultsRobotsDirectives(
  pageData: PublicOfficialResultsPageData,
): Metadata['robots'] | undefined {
  if (pageData.state !== 'official') return { index: false, follow: false };
  if (pageData.edition.visibility !== 'published') return { index: false, follow: false };
  return undefined;
}

export function isPublicOfficialResultsPageIndexable(
  pageData: PublicOfficialResultsPageData,
): pageData is Extract<PublicOfficialResultsPageData, { state: 'official' }> {
  return resolvePublicOfficialResultsRobotsDirectives(pageData) === undefined;
}
