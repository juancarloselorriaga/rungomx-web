import { writeCanonicalMoneyEventSchemaArtifacts } from '../../lib/payments/core/contracts/events';

async function main() {
  const outputDir = process.argv[2];
  const writtenFiles = await writeCanonicalMoneyEventSchemaArtifacts(outputDir);

  console.log(`[payments-contracts] Wrote ${writtenFiles.length} artifact files.`);
  for (const filePath of writtenFiles) {
    console.log(`[payments-contracts] ${filePath}`);
  }
}

main().catch((error) => {
  console.error('[payments-contracts] Failed to generate event registry snapshots.');
  console.error(error);
  process.exit(1);
});

