import { z } from 'zod';

import {
  canonicalMoneyEventNameSchema,
  canonicalMoneyEventNames,
  canonicalMoneyEventSchemaByNameV1,
  type CanonicalMoneyEventName,
  type CanonicalMoneyEventV1,
} from './v1';

const moneyEventVersionSchema = z.object({
  eventName: canonicalMoneyEventNameSchema,
  version: z.number().int().positive(),
});

export type CanonicalMoneyEventUpcaster = (event: unknown) => CanonicalMoneyEventV1;

export type CanonicalMoneyEventRegistryEntry = {
  eventName: CanonicalMoneyEventName;
  version: 1;
  schemaId: string;
  schemaFile: string;
  schema: (typeof canonicalMoneyEventSchemaByNameV1)[CanonicalMoneyEventName];
  upcasterVersions: readonly [1];
  upcast: CanonicalMoneyEventUpcaster;
};

export function toCanonicalMoneyEventSchemaFileName(
  eventName: CanonicalMoneyEventName,
  version: number,
): string {
  return `${eventName.replace(/\./g, '-')}.v${version}.schema.json`;
}

function buildSchemaId(eventName: CanonicalMoneyEventName, version: number): string {
  return `payments.${eventName}.v${version}`;
}

export const canonicalMoneyEventRegistry = canonicalMoneyEventNames.map((eventName) => ({
  eventName,
  version: 1 as const,
  schemaId: buildSchemaId(eventName, 1),
  schemaFile: toCanonicalMoneyEventSchemaFileName(eventName, 1),
  schema: canonicalMoneyEventSchemaByNameV1[eventName],
  upcasterVersions: [1] as const,
  upcast: (event: unknown) => canonicalMoneyEventSchemaByNameV1[eventName].parse(event),
})) as readonly CanonicalMoneyEventRegistryEntry[];

export const canonicalMoneyEventRegistryByKey = new Map<string, CanonicalMoneyEventRegistryEntry>(
  canonicalMoneyEventRegistry.map((entry) => [`${entry.eventName}@v${entry.version}`, entry]),
);

export function assertCanonicalMoneyEventRegistryCoverage(): void {
  if (canonicalMoneyEventRegistry.length !== canonicalMoneyEventNames.length) {
    throw new Error('Canonical money event registry does not cover all canonical event names.');
  }

  const seen = new Set<string>();
  for (const entry of canonicalMoneyEventRegistry) {
    const key = `${entry.eventName}@v${entry.version}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate registry entry detected for ${key}.`);
    }
    seen.add(key);

    if (!entry.upcasterVersions.includes(entry.version)) {
      throw new Error(
        `Upcaster compatibility is missing for canonical event ${entry.eventName} v${entry.version}.`,
      );
    }
  }
}

export function parseCanonicalMoneyEventWithUpcasting(input: unknown): CanonicalMoneyEventV1 {
  const parsedVersion = moneyEventVersionSchema.parse(input);
  const entry = canonicalMoneyEventRegistryByKey.get(
    `${parsedVersion.eventName}@v${parsedVersion.version}`,
  );

  if (!entry) {
    throw new Error(
      `Unsupported canonical money event version: ${parsedVersion.eventName} v${parsedVersion.version}`,
    );
  }

  return entry.upcast(input);
}

export function buildCanonicalMoneyEventRegistryIndex() {
  return {
    registryVersion: 1,
    events: canonicalMoneyEventRegistry
      .map((entry) => ({
        eventName: entry.eventName,
        version: entry.version,
        schemaId: entry.schemaId,
        schemaFile: entry.schemaFile,
        upcasterVersions: [...entry.upcasterVersions],
      }))
      .sort((a, b) =>
        a.eventName === b.eventName ? a.version - b.version : a.eventName.localeCompare(b.eventName),
      ),
  };
}
