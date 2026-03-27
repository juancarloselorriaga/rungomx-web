import { QuestionsManager } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/questions/questions-manager';
import type { RegistrationQuestionData } from '@/lib/events/questions/actions';
import { reorderQuestions } from '@/lib/events/questions/actions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/lib/events/questions/actions', () => ({
  createQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
  reorderQuestions: jest.fn(),
  updateQuestion: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const reorderQuestionsMock = reorderQuestions as jest.MockedFunction<typeof reorderQuestions>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildQuestion(
  id: string,
  prompt: string,
  sortOrder: number,
  overrides: Partial<RegistrationQuestionData> = {},
): RegistrationQuestionData {
  return {
    id,
    editionId: 'edition-1',
    distanceId: null,
    type: 'text',
    prompt,
    helpText: null,
    isRequired: false,
    options: null,
    sortOrder,
    isActive: true,
    ...overrides,
  };
}

function expectPromptBefore(firstPrompt: string, secondPrompt: string) {
  const firstNode = screen.getByText(firstPrompt);
  const secondNode = screen.getByText(secondPrompt);

  expect(
    firstNode.compareDocumentPosition(secondNode) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe('QuestionsManager reordering', () => {
  const initialQuestions = [
    buildQuestion('q1', 'Question A', 0, { isRequired: true }),
    buildQuestion('q2', 'Question B', 1, { type: 'single_select', options: ['One', 'Two'] }),
    buildQuestion('q3', 'Question C', 2, { distanceId: 'distance-1', type: 'checkbox' }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits reordered ids before updating visible order', async () => {
    const deferred = createDeferred<{ ok: true; data: undefined }>();
    reorderQuestionsMock.mockReturnValueOnce(deferred.promise);

    render(
      <QuestionsManager
        editionId="edition-1"
        distances={[{ id: 'distance-1', label: '35K' }]}
        initialQuestions={initialQuestions}
      />,
    );

    expectPromptBefore('Question A', 'Question B');

    fireEvent.click(screen.getAllByRole('button', { name: 'reorder.moveDown' })[0]);

    expect(reorderQuestionsMock).toHaveBeenCalledWith({
      editionId: 'edition-1',
      questionIds: ['q2', 'q1', 'q3'],
    });

    expectPromptBefore('Question A', 'Question B');

    deferred.resolve({ ok: true, data: undefined });

    await waitFor(() => {
      expectPromptBefore('Question B', 'Question A');
    });
  });

  it('uses the latest local order for repeated reorder interactions', async () => {
    reorderQuestionsMock.mockResolvedValue({ ok: true, data: undefined });

    render(
      <QuestionsManager
        editionId="edition-1"
        distances={[{ id: 'distance-1', label: '35K' }]}
        initialQuestions={initialQuestions}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'reorder.moveDown' })[0]);

    await waitFor(() => {
      expect(reorderQuestionsMock).toHaveBeenNthCalledWith(1, {
        editionId: 'edition-1',
        questionIds: ['q2', 'q1', 'q3'],
      });
      expectPromptBefore('Question B', 'Question A');
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'reorder.moveUp' })[1]).toBeEnabled();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'reorder.moveUp' })[1]);

    await waitFor(() => {
      expect(reorderQuestionsMock).toHaveBeenNthCalledWith(2, {
        editionId: 'edition-1',
        questionIds: ['q1', 'q2', 'q3'],
      });
      expectPromptBefore('Question A', 'Question B');
    });
  });
});
