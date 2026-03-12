import { shouldAutoOpenDistanceComposer } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-surface';

describe('event settings distance surface behavior', () => {
  it('only auto-opens the distance composer in the wizard distance surface', () => {
    expect(shouldAutoOpenDistanceComposer('wizard-distances', 0)).toBe(true);
    expect(shouldAutoOpenDistanceComposer('full', 0)).toBe(false);
    expect(shouldAutoOpenDistanceComposer('wizard-basics', 0)).toBe(false);
    expect(shouldAutoOpenDistanceComposer('wizard-distances', 2)).toBe(false);
  });
});
