import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  assertCanonicalMoneyEventRegistryCoverage,
  buildCanonicalMoneyEventRegistryIndex,
  canonicalMoneyEventRegistry,
} from './registry';

export type CanonicalMoneyEventSchemaArtifacts = {
  index: ReturnType<typeof buildCanonicalMoneyEventRegistryIndex>;
  schemas: Array<{
    fileName: string;
    schema: Record<string, unknown>;
  }>;
};

export function buildCanonicalMoneyEventSchemaArtifacts(): CanonicalMoneyEventSchemaArtifacts {
  assertCanonicalMoneyEventRegistryCoverage();

  const schemas = canonicalMoneyEventRegistry
    .map((entry) => ({
      fileName: entry.schemaFile,
      schema: z.toJSONSchema(entry.schema, { reused: 'ref' }) as Record<string, unknown>,
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  return {
    index: buildCanonicalMoneyEventRegistryIndex(),
    schemas,
  };
}

export async function writeCanonicalMoneyEventSchemaArtifacts(
  outputDir = path.resolve(process.cwd(), 'docs/payments/contracts/event-registry'),
): Promise<string[]> {
  const artifacts = buildCanonicalMoneyEventSchemaArtifacts();
  const writtenFiles: string[] = [];

  await fs.mkdir(outputDir, { recursive: true });

  const indexFile = path.join(outputDir, 'index.json');
  await fs.writeFile(indexFile, `${JSON.stringify(artifacts.index, null, 2)}\n`, 'utf8');
  writtenFiles.push(indexFile);

  for (const artifact of artifacts.schemas) {
    const schemaFilePath = path.join(outputDir, artifact.fileName);
    await fs.writeFile(schemaFilePath, `${JSON.stringify(artifact.schema, null, 2)}\n`, 'utf8');
    writtenFiles.push(schemaFilePath);
  }

  return writtenFiles;
}

