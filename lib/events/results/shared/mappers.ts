import { resultEntries, resultVersions } from '@/db/schema';
import type {
  ResultEntryRecord,
  ResultVersionRecord,
} from '@/lib/events/results/types';

export type ResultVersionRow = typeof resultVersions.$inferSelect;
export type ResultEntryRow = typeof resultEntries.$inferSelect;

export function toResultVersionRecord(row: ResultVersionRow): ResultVersionRecord {
  return {
    id: row.id,
    editionId: row.editionId,
    status: row.status,
    source: row.source,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    createdByUserId: row.createdByUserId,
    finalizedByUserId: row.finalizedByUserId,
    finalizedAt: row.finalizedAt,
    sourceFileChecksum: row.sourceFileChecksum,
    sourceReference: row.sourceReference,
    provenanceJson: row.provenanceJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toResultEntryRecord(row: ResultEntryRow): ResultEntryRecord {
  return {
    id: row.id,
    resultVersionId: row.resultVersionId,
    distanceId: row.distanceId,
    userId: row.userId,
    discipline: row.discipline,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    gender: row.gender,
    age: row.age,
    status: row.status,
    finishTimeMillis: row.finishTimeMillis,
    overallPlace: row.overallPlace,
    genderPlace: row.genderPlace,
    ageGroupPlace: row.ageGroupPlace,
    identitySnapshot: row.identitySnapshot,
    rawSourceData: row.rawSourceData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
