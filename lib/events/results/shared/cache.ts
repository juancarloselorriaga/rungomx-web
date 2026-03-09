import { revalidateTag } from 'next/cache';

import {
  rankingsNationalTag,
  rankingsOrganizerTag,
  rankingsRulesetCurrentTag,
  resultsEditionTag,
  resultsOfficialTag,
} from '@/lib/events/results/cache-tags';
import { revalidatePublicEventByEditionId } from '@/lib/events/shared';

export async function revalidateResultsPublicationArtifacts(params: {
  editionId: string;
  organizationId?: string | null;
}): Promise<void> {
  revalidateTag(resultsEditionTag(params.editionId), { expire: 0 });
  revalidateTag(resultsOfficialTag(params.editionId), { expire: 0 });
  revalidateTag(rankingsNationalTag(), { expire: 0 });
  revalidateTag(rankingsRulesetCurrentTag(), { expire: 0 });
  if (params.organizationId) {
    revalidateTag(rankingsOrganizerTag(params.organizationId), { expire: 0 });
  }
  await revalidatePublicEventByEditionId(params.editionId);
}
