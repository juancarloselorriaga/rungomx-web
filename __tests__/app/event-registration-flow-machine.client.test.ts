import {
  buildRegistrationSteps,
  getProgressSteps,
  getStepNumber,
} from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow-machine';

describe('registration flow machine', () => {
  it('keeps distance in the progress rail so resumed registrations still show info as step 2', () => {
    const steps = buildRegistrationSteps({
      activeAddOnCount: 0,
      activeQuestionCount: 0,
      hasPoliciesStep: false,
      waiverCount: 0,
    });

    expect(getProgressSteps(steps)).toEqual(['distance', 'info', 'payment']);
    expect(getStepNumber(steps, 'info')).toBe(2);
  });
});
