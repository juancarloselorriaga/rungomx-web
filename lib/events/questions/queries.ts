import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { registrationAnswers, registrationQuestions } from '@/db/schema';
import type { RegistrationAnswerData, RegistrationQuestionData } from './actions';

/**
 * Get all registration questions for an event edition.
 */
export async function getQuestionsForEdition(editionId: string): Promise<RegistrationQuestionData[]> {
  const questions = await db.query.registrationQuestions.findMany({
    where: and(eq(registrationQuestions.editionId, editionId), isNull(registrationQuestions.deletedAt)),
    orderBy: [asc(registrationQuestions.sortOrder)],
  });

  return questions.map((q) => ({
    id: q.id,
    editionId: q.editionId,
    distanceId: q.distanceId,
    type: q.type,
    prompt: q.prompt,
    helpText: q.helpText,
    isRequired: q.isRequired,
    options: q.options,
    sortOrder: q.sortOrder,
    isActive: q.isActive,
  }));
}

/**
 * Get questions applicable to a specific distance (includes edition-wide questions).
 */
export async function getQuestionsForDistance(
  editionId: string,
  distanceId: string,
): Promise<RegistrationQuestionData[]> {
  const questions = await db.query.registrationQuestions.findMany({
    where: and(
      eq(registrationQuestions.editionId, editionId),
      isNull(registrationQuestions.deletedAt),
      eq(registrationQuestions.isActive, true),
    ),
    orderBy: [asc(registrationQuestions.sortOrder)],
  });

  // Filter to include edition-wide questions (distanceId is null) or distance-specific ones
  return questions
    .filter((q) => q.distanceId === null || q.distanceId === distanceId)
    .map((q) => ({
      id: q.id,
      editionId: q.editionId,
      distanceId: q.distanceId,
      type: q.type,
      prompt: q.prompt,
      helpText: q.helpText,
      isRequired: q.isRequired,
      options: q.options,
      sortOrder: q.sortOrder,
      isActive: q.isActive,
    }));
}

/**
 * Get a single question by ID.
 */
export async function getQuestionById(questionId: string): Promise<RegistrationQuestionData | null> {
  const question = await db.query.registrationQuestions.findFirst({
    where: and(eq(registrationQuestions.id, questionId), isNull(registrationQuestions.deletedAt)),
  });

  if (!question) return null;

  return {
    id: question.id,
    editionId: question.editionId,
    distanceId: question.distanceId,
    type: question.type,
    prompt: question.prompt,
    helpText: question.helpText,
    isRequired: question.isRequired,
    options: question.options,
    sortOrder: question.sortOrder,
    isActive: question.isActive,
  };
}

/**
 * Get answers for a registration.
 */
export async function getAnswersForRegistration(
  registrationId: string,
): Promise<RegistrationAnswerData[]> {
  const answers = await db.query.registrationAnswers.findMany({
    where: eq(registrationAnswers.registrationId, registrationId),
    with: {
      question: true,
    },
  });

  return answers.map((a) => ({
    id: a.id,
    registrationId: a.registrationId,
    questionId: a.questionId,
    value: a.value,
    question: {
      id: a.question.id,
      prompt: a.question.prompt,
      type: a.question.type,
    },
  }));
}

/**
 * Get answers for a registration keyed by question ID.
 */
export async function getAnswerMapForRegistration(
  registrationId: string,
): Promise<Map<string, string | null>> {
  const answers = await db.query.registrationAnswers.findMany({
    where: eq(registrationAnswers.registrationId, registrationId),
  });

  return new Map(answers.map((a) => [a.questionId, a.value]));
}
