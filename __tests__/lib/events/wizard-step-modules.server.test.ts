import { EVENT_WIZARD_STEP_MODULES } from '@/lib/events/wizard/step-modules';

describe('wizard step modules', () => {
  it('covers all canonical reusable domains without duplicate ids', () => {
    const ids = EVENT_WIZARD_STEP_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'choose_path',
      'event_details',
      'distances',
      'pricing',
      'faq',
      'waivers',
      'questions',
      'policies',
      'website',
      'add_ons',
      'publish',
    ]);
  });

  it('supports both AI and manual paths for every module', () => {
    for (const stepModule of EVENT_WIZARD_STEP_MODULES) {
      expect(stepModule.paths).toContain('ai');
      expect(stepModule.paths).toContain('manual');
    }
  });

  it('maps each module to an existing reused editor target', () => {
    for (const stepModule of EVENT_WIZARD_STEP_MODULES) {
      expect(stepModule.reuseTarget).toContain('.');
      expect(stepModule.reuseTarget.length).toBeGreaterThan(5);
    }
  });
});
