export function resultsEditionTag(editionId: string) {
  return `results:edition:${editionId}`;
}

export function resultsOfficialTag(editionId: string) {
  return `results:official:${editionId}`;
}

export function resultsSearchTag() {
  return 'results:search';
}

export function rankingsNationalTag() {
  return 'rankings:national';
}

export function rankingsOrganizerTag(organizationId: string) {
  return `rankings:organizer:${organizationId}`;
}

export function rankingsRulesetCurrentTag() {
  return 'rankings:ruleset:current';
}
