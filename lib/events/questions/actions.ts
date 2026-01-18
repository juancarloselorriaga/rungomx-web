'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  registrationAnswers,
  registrationQuestions,
  registrations,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import {
  canUserAccessEvent,
  requireOrgPermission,
} from '@/lib/organizations/permissions';
import { REGISTRATION_QUESTION_TYPES } from '../constants';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type RegistrationQuestionData = {
  id: string;
  editionId: string;
  distanceId: string | null;
  type: (typeof REGISTRATION_QUESTION_TYPES)[number];
  prompt: string;
  helpText: string | null;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  isActive: boolean;
};

export type RegistrationAnswerData = {
  id: string;
  registrationId: string;
  questionId: string;
  value: string | null;
  question: {
    id: string;
    prompt: string;
    type: (typeof REGISTRATION_QUESTION_TYPES)[number];
  };
};

// =============================================================================
// Helpers
// =============================================================================

function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  if (!authContext.permissions.canViewOrganizersDashboard) {
    return {
      error: 'You do not have permission to manage events',
      code: 'FORBIDDEN',
    };
  }

  return null;
}

// =============================================================================
// Schemas
// =============================================================================

const createQuestionSchema = z.object({
  editionId: z.string().uuid(),
  distanceId: z.string().uuid().optional().nullable(),
  type: z.enum(REGISTRATION_QUESTION_TYPES),
  prompt: z.string().min(1).max(500),
  helpText: z.string().max(500).optional().nullable(),
  isRequired: z.boolean().default(false),
  options: z.array(z.string().min(1).max(100)).optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    // single_select must have options
    if (data.type === 'single_select' && (!data.options || data.options.length < 2)) {
      return false;
    }
    return true;
  },
  {
    message: 'Single select questions must have at least 2 options',
    path: ['options'],
  },
);

const updateQuestionSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string().min(1).max(500).optional(),
  helpText: z.string().max(500).optional().nullable(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string().min(1).max(100)).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  distanceId: z.string().uuid().optional().nullable(),
});

const deleteQuestionSchema = z.object({
  questionId: z.string().uuid(),
});

const reorderQuestionsSchema = z.object({
  editionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()),
});

const submitAnswersSchema = z.object({
  registrationId: z.string().uuid(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      value: z.string().nullable(),
    }),
  ),
});

// =============================================================================
// Organizer Actions
// =============================================================================

/**
 * Create a new registration question for an event edition.
 */
export const createQuestion = withAuthenticatedUser<ActionResult<RegistrationQuestionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createQuestionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createQuestionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, distanceId, type, prompt, helpText, isRequired, options, sortOrder, isActive } =
    validated.data;

  // Check permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Verify the edition exists
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // If distanceId is provided, verify it belongs to this edition
  if (distanceId) {
    const distance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, distanceId),
        eq(eventDistances.editionId, editionId),
        isNull(eventDistances.deletedAt),
      ),
    });

    if (!distance) {
      return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const question = await db.transaction(async (tx) => {
    const [newQuestion] = await tx
      .insert(registrationQuestions)
      .values({
        editionId,
        distanceId: distanceId || null,
        type,
        prompt,
        helpText: helpText || null,
        isRequired,
        options: options || null,
        sortOrder,
        isActive,
      })
      .returning();

    await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'registration_question.create',
        entityType: 'registration_question',
        entityId: newQuestion.id,
        after: { prompt, type, isRequired },
        request: requestContext,
      },
      tx,
    );

    return newQuestion;
  });

  return {
    ok: true,
    data: {
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
    },
  };
});

/**
 * Update an existing registration question.
 */
export const updateQuestion = withAuthenticatedUser<ActionResult<RegistrationQuestionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateQuestionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateQuestionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { questionId, ...updates } = validated.data;

  const existingQuestion = await db.query.registrationQuestions.findFirst({
    where: and(eq(registrationQuestions.id, questionId), isNull(registrationQuestions.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingQuestion) {
    return { ok: false, error: 'Question not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingQuestion.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // If distanceId is being updated, verify it belongs to this edition
  if (updates.distanceId !== undefined && updates.distanceId !== null) {
    const distance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, updates.distanceId),
        eq(eventDistances.editionId, existingQuestion.editionId),
        isNull(eventDistances.deletedAt),
      ),
    });

    if (!distance) {
      return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const updatedQuestion = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(registrationQuestions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(registrationQuestions.id, questionId))
      .returning();

    await createAuditLog(
      {
        organizationId: existingQuestion.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'registration_question.update',
        entityType: 'registration_question',
        entityId: questionId,
        before: {
          prompt: existingQuestion.prompt,
          isRequired: existingQuestion.isRequired,
          isActive: existingQuestion.isActive,
        },
        after: updates,
        request: requestContext,
      },
      tx,
    );

    return updated;
  });

  return {
    ok: true,
    data: {
      id: updatedQuestion.id,
      editionId: updatedQuestion.editionId,
      distanceId: updatedQuestion.distanceId,
      type: updatedQuestion.type,
      prompt: updatedQuestion.prompt,
      helpText: updatedQuestion.helpText,
      isRequired: updatedQuestion.isRequired,
      options: updatedQuestion.options,
      sortOrder: updatedQuestion.sortOrder,
      isActive: updatedQuestion.isActive,
    },
  };
});

/**
 * Soft delete a registration question.
 */
export const deleteQuestion = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteQuestionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = deleteQuestionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { questionId } = validated.data;

  const existingQuestion = await db.query.registrationQuestions.findFirst({
    where: and(eq(registrationQuestions.id, questionId), isNull(registrationQuestions.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingQuestion) {
    return { ok: false, error: 'Question not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingQuestion.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(registrationQuestions)
      .set({ deletedAt: new Date() })
      .where(eq(registrationQuestions.id, questionId));

    await createAuditLog(
      {
        organizationId: existingQuestion.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'registration_question.delete',
        entityType: 'registration_question',
        entityId: questionId,
        before: { prompt: existingQuestion.prompt },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});

/**
 * Reorder questions for an edition.
 */
export const reorderQuestions = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reorderQuestionsSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = reorderQuestionsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, questionIds } = validated.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < questionIds.length; i++) {
      await tx
        .update(registrationQuestions)
        .set({ sortOrder: i })
        .where(
          and(
            eq(registrationQuestions.id, questionIds[i]),
            eq(registrationQuestions.editionId, editionId),
          ),
        );
    }
  });

  return { ok: true, data: undefined };
});

// =============================================================================
// Registration Actions (Public)
// =============================================================================

/**
 * Submit answers for registration questions.
 */
export const submitAnswers = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof submitAnswersSchema>) => {
  const validated = submitAnswersSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, answers } = validated.data;

  // Find the registration
  const registration = await db.query.registrations.findFirst({
    where: and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  // Verify ownership
  if (registration.buyerUserId !== authContext.user.id) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  // Validate required questions have answers
  const questions = await db.query.registrationQuestions.findMany({
    where: and(
      eq(registrationQuestions.editionId, registration.editionId),
      isNull(registrationQuestions.deletedAt),
      eq(registrationQuestions.isActive, true),
    ),
  });

  // Filter questions applicable to this registration's distance
  const applicableQuestions = questions.filter(
    (q) => q.distanceId === null || q.distanceId === registration.distanceId,
  );

  const requiredQuestionIds = new Set(
    applicableQuestions.filter((q) => q.isRequired).map((q) => q.id),
  );

  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));

  for (const requiredId of requiredQuestionIds) {
    const answer = answerMap.get(requiredId);
    if (answer === null || answer === undefined || answer.trim() === '') {
      const question = applicableQuestions.find((q) => q.id === requiredId);
      return {
        ok: false,
        error: `Please answer the required question: ${question?.prompt}`,
        code: 'MISSING_REQUIRED_ANSWER',
      };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    // Upsert all answers
    for (const answer of answers) {
      // Verify the question exists and is applicable
      const question = applicableQuestions.find((q) => q.id === answer.questionId);
      if (!question) continue;

      // Check if answer exists
      const existingAnswer = await tx.query.registrationAnswers.findFirst({
        where: and(
          eq(registrationAnswers.registrationId, registrationId),
          eq(registrationAnswers.questionId, answer.questionId),
        ),
      });

      if (existingAnswer) {
        await tx
          .update(registrationAnswers)
          .set({
            value: answer.value,
            updatedAt: new Date(),
          })
          .where(eq(registrationAnswers.id, existingAnswer.id));
      } else {
        await tx.insert(registrationAnswers).values({
          registrationId,
          questionId: answer.questionId,
          value: answer.value,
        });
      }
    }

    await createAuditLog(
      {
        organizationId: registration.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'registration_answers.submit',
        entityType: 'registration',
        entityId: registrationId,
        after: { answerCount: answers.length },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});
