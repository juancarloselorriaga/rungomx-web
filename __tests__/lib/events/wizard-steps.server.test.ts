import {
  EVENT_SETUP_WIZARD_STEP_DEFINITIONS,
  EVENT_SETUP_WIZARD_STEP_IDS,
  isEventSetupWizardStepId,
  mapWizardIssueStepToSetupStep,
} from '@/lib/events/wizard/steps';

describe('event wizard setup step contracts', () => {
  it('exports the canonical runtime setup step ids once', () => {
    expect(EVENT_SETUP_WIZARD_STEP_IDS).toEqual([
      'basics',
      'distances',
      'pricing',
      'registration',
      'policies',
      'content',
      'extras',
      'review',
    ]);
  });

  it('maps canonical wizard issue steps to setup steps', () => {
    expect(mapWizardIssueStepToSetupStep('event_details')).toBe('basics');
    expect(mapWizardIssueStepToSetupStep('faq')).toBe('content');
    expect(mapWizardIssueStepToSetupStep('questions')).toBe('extras');
    expect(mapWizardIssueStepToSetupStep('publish')).toBe('review');
  });

  it('uses the canonical runtime ids for step definitions and runtime parsing', () => {
    expect(EVENT_SETUP_WIZARD_STEP_DEFINITIONS.map((step) => step.id)).toEqual(
      EVENT_SETUP_WIZARD_STEP_IDS,
    );
    expect(isEventSetupWizardStepId('pricing')).toBe(true);
    expect(isEventSetupWizardStepId('publish')).toBe(false);
  });
});
