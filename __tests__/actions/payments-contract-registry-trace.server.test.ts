import fs from 'node:fs';
import path from 'node:path';

import {
  assertCanonicalMoneyEventRegistryCoverage,
  buildCanonicalMoneyEventSchemaArtifacts,
  canonicalMoneyEventNames,
  canonicalMoneyEventRegistry,
} from '@/lib/payments/core/contracts/events';

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  required?: string[];
};

function readCommittedSchema(fileName: string): JsonSchemaObject {
  const schemaPath = path.join(process.cwd(), 'docs/payments/contracts/event-registry', fileName);
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonSchemaObject;
}

describe('payments contracts trace coverage (API level)', () => {
  it('1.1-API-001 keeps the brownfield payments contract registry committed inside the existing repo', () => {
    const indexPath = path.join(process.cwd(), 'docs/payments/contracts/event-registry/index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(canonicalMoneyEventRegistry).toHaveLength(canonicalMoneyEventNames.length);
  });

  it('1.1-API-002 enforces shared canonical envelope invariants for every generated event schema', () => {
    const generated = buildCanonicalMoneyEventSchemaArtifacts();
    const requiredEnvelopeFields = [
      'eventId',
      'traceId',
      'occurredAt',
      'eventName',
      'version',
      'entityType',
      'entityId',
      'source',
      'metadata',
      'payload',
    ];

    for (const schemaArtifact of generated.schemas) {
      const schema = schemaArtifact.schema as JsonSchemaObject;
      const required = schema.required ?? [];
      const properties = schema.properties ?? {};

      for (const envelopeField of requiredEnvelopeFields) {
        expect(required).toContain(envelopeField);
        expect(Object.prototype.hasOwnProperty.call(properties, envelopeField)).toBe(true);
      }
    }
  });

  it('1.1-API-003 keeps committed registry index + schema snapshots synchronized with generated artifacts', () => {
    const generated = buildCanonicalMoneyEventSchemaArtifacts();
    const artifactDir = path.join(process.cwd(), 'docs/payments/contracts/event-registry');
    const committedIndex = JSON.parse(
      fs.readFileSync(path.join(artifactDir, 'index.json'), 'utf8'),
    ) as unknown;

    expect(committedIndex).toEqual(generated.index);

    for (const schemaArtifact of generated.schemas) {
      const committedSchema = readCommittedSchema(schemaArtifact.fileName);
      expect(committedSchema).toEqual(schemaArtifact.schema);
    }
  });

  it('1.1-API-004 keeps upcaster compatibility + schema coverage checks green for CI contract validation gates', () => {
    expect(() => assertCanonicalMoneyEventRegistryCoverage()).not.toThrow();

    for (const entry of canonicalMoneyEventRegistry) {
      expect(entry.upcasterVersions).toContain(entry.version);
    }
  });
});
