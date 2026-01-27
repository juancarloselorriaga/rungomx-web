import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { registrationQuestions } from '@/db/schema';

export async function getApplicableRegistrationQuestions(params: {
  editionId: string;
  distanceId: string;
}) {
  const questions = await db.query.registrationQuestions.findMany({
    where: and(
      eq(registrationQuestions.editionId, params.editionId),
      isNull(registrationQuestions.deletedAt),
      eq(registrationQuestions.isActive, true),
    ),
  });

  return questions.filter(
    (q) => q.distanceId === null || q.distanceId === params.distanceId,
  );
}

export function findMissingRequiredQuestion(
  questions: Array<{ id: string; isRequired: boolean; prompt: string }>,
  answerMap: Map<string, string | null>,
) {
  for (const question of questions) {
    if (!question.isRequired) continue;
    const answer = answerMap.get(question.id);
    if (answer === null || answer === undefined || answer.trim() === '') {
      return question;
    }
  }
  return null;
}
