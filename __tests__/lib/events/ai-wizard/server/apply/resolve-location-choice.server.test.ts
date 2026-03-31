import { resolveLocationChoice } from '@/lib/events/ai-wizard/server/apply/resolve-location-choice';

describe('resolveLocationChoice', () => {
  it('returns the original patch when no choice request is present', () => {
    const patch = {
      title: 'No choice needed',
      summary: 'Already resolved.',
      ops: [
        {
          type: 'update_edition' as const,
          editionId: '11111111-1111-4111-8111-111111111111',
          data: { locationDisplay: 'Bosque de Chapultepec' },
        },
      ],
    };

    expect(resolveLocationChoice({ patch })).toEqual({ ok: true, patch });
  });

  it('rejects a missing location choice when the patch requires one', () => {
    const result = resolveLocationChoice({
      patch: {
        title: 'Choose location',
        summary: 'Needs a choice.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { locationDisplay: 'Chapultepec' },
          },
        ],
        choiceRequest: {
          kind: 'location_candidate_selection',
          selectionMode: 'single',
          sourceStepId: 'basics',
          targetField: 'event_location',
          query: 'Chapultepec',
          options: [
            {
              lat: 19.4204,
              lng: -99.1821,
              formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
            },
          ],
        },
      },
    });

    expect(result).toEqual({ ok: false, details: { reason: 'MISSING_LOCATION_CHOICE' } });
  });

  it('merges the selected candidate into the update_edition op server-side', () => {
    const result = resolveLocationChoice({
      patch: {
        title: 'Choose location',
        summary: 'Needs a choice.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { locationDisplay: 'Chapultepec' },
          },
        ],
        locationResolution: {
          status: 'ambiguous',
          query: 'Chapultepec',
          candidates: [
            {
              lat: 19.4204,
              lng: -99.1821,
              formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
              address: 'Gran Avenida, 11580 Ciudad de México, México',
              city: 'Ciudad de México',
              region: 'Ciudad de México',
              countryCode: 'MX',
              placeId: 'mapbox-1',
              provider: 'mapbox',
            },
          ],
        },
        choiceRequest: {
          kind: 'location_candidate_selection',
          selectionMode: 'single',
          sourceStepId: 'basics',
          targetField: 'event_location',
          query: 'Chapultepec',
          options: [
            {
              lat: 19.4204,
              lng: -99.1821,
              formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
              address: 'Gran Avenida, 11580 Ciudad de México, México',
              city: 'Ciudad de México',
              region: 'Ciudad de México',
              countryCode: 'MX',
              placeId: 'mapbox-1',
              provider: 'mapbox',
            },
          ],
        },
      },
      locationChoice: { optionIndex: 0 },
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        title: 'Choose location',
        summary: 'Needs a choice.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
              address: 'Gran Avenida, 11580 Ciudad de México, México',
              city: 'Ciudad de México',
              state: 'Ciudad de México',
              country: 'MX',
              latitude: '19.4204',
              longitude: '-99.1821',
            },
          },
        ],
        locationResolution: {
          status: 'matched',
          query: 'Chapultepec',
          candidate: {
            lat: 19.4204,
            lng: -99.1821,
            formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
            address: 'Gran Avenida, 11580 Ciudad de México, México',
            city: 'Ciudad de México',
            region: 'Ciudad de México',
            countryCode: 'MX',
            placeId: 'mapbox-1',
            provider: 'mapbox',
          },
        },
        choiceRequest: undefined,
      },
    });
  });
});
