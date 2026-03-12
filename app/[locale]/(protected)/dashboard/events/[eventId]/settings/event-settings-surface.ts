export type EventSettingsSurface =
  | 'full'
  | 'wizard-basics'
  | 'wizard-distances'
  | 'wizard-registration'
  | 'wizard-review';

export function shouldAutoOpenDistanceComposer(
  surface: EventSettingsSurface | undefined,
  distanceCount: number,
) {
  return surface === 'wizard-distances' && distanceCount === 0;
}
