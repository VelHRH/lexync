import { canonicalLanguageTag } from '@lexync/domain';
import type { DynamicLessonQuestionCandidate } from './generation';

export class DynamicLessonGenerationError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Generated Lesson Questions are invalid: ${reason}`);
    this.reason = reason;
  }
}

export type ValidatedDynamicLessonQuestion = DynamicLessonQuestionCandidate;

export type DynamicLessonValidationContext = {
  minQuestions: number;
  maxQuestions: number;
  learningLanguageTag: string;
  answerLanguageTag: string;
  passages: readonly { id: string }[];
};

function fail(reason: string): never {
  throw new DynamicLessonGenerationError(reason);
}

export function validateDynamicLessonQuestions(
  candidates: readonly DynamicLessonQuestionCandidate[],
  context: DynamicLessonValidationContext,
): ValidatedDynamicLessonQuestion[] {
  if (!Array.isArray(candidates)) fail('the provider did not return an array of Lesson Questions');
  if (candidates.length < context.minQuestions || candidates.length > context.maxQuestions) {
    fail(`question count ${candidates.length} is outside the allowed range ${context.minQuestions}-${context.maxQuestions}`);
  }

  const passageIds = new Set(context.passages.map((passage) => passage.id));
  const promptKeys = new Set<string>();
  const normalized: ValidatedDynamicLessonQuestion[] = [];

  candidates.forEach((candidate, index) => {
    const at = `question ${index}`;

    const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : '';
    if (!prompt) fail(`${at} has an empty prompt`);
    const promptKey = prompt.toLowerCase();
    if (promptKeys.has(promptKey)) fail(`${at} repeats the prompt of an earlier question`);
    promptKeys.add(promptKey);

    if (!Array.isArray(candidate.choices)) fail(`${at} has no choices array`);
    const choices = candidate.choices.map((choice: unknown) => (typeof choice === 'string' ? choice.trim() : ''));
    if (choices.length < 2 || choices.length > 4) fail(`${at} has ${choices.length} choices, expected 2-4`);
    if (choices.some((choice: string) => !choice)) fail(`${at} has an empty choice`);
    if (new Set(choices).size !== choices.length) fail(`${at} has duplicate choices`);

    const correctAnswer = typeof candidate.correctAnswer === 'string' ? candidate.correctAnswer.trim() : '';
    if (!correctAnswer) fail(`${at} has an empty correct answer`);
    const matches = choices.filter((choice: string) => choice === correctAnswer).length;
    if (matches !== 1) fail(`${at} has a correct answer matching ${matches} choices, expected exactly 1`);

    let direction: 'recognition' | 'recall' | null = null;
    let answerLanguageTag: string | null = null;

    if (candidate.questionType === 'translation') {
      if (candidate.direction !== 'recognition' && candidate.direction !== 'recall') {
        fail(`${at} is a translation question with direction ${JSON.stringify(candidate.direction)}`);
      }
      const canonicalAnswerLanguageTag = candidate.answerLanguageTag ? canonicalLanguageTag(candidate.answerLanguageTag) : null;
      if (!canonicalAnswerLanguageTag) {
        fail(`${at} is a translation question with answer language tag ${JSON.stringify(candidate.answerLanguageTag)}`);
      }
      if (canonicalAnswerLanguageTag !== context.answerLanguageTag) {
        fail(`${at} answers in ${canonicalAnswerLanguageTag}, expected ${context.answerLanguageTag}`);
      }
      direction = candidate.direction;
      answerLanguageTag = canonicalAnswerLanguageTag;
    } else if (candidate.questionType === 'cloze') {
      if (candidate.direction !== null && candidate.direction !== undefined) {
        fail(`${at} is a cloze question carrying direction ${JSON.stringify(candidate.direction)}`);
      }
      if (candidate.answerLanguageTag !== null && candidate.answerLanguageTag !== undefined) {
        fail(`${at} is a cloze question carrying answer language tag ${JSON.stringify(candidate.answerLanguageTag)}`);
      }
    } else {
      fail(`${at} has question type ${JSON.stringify(candidate.questionType)}`);
    }

    if (!Array.isArray(candidate.supportingPassageIds) || !candidate.supportingPassageIds.length) {
      fail(`${at} cites no supporting passages`);
    }
    const unknownPassageIds = candidate.supportingPassageIds.filter((id: string) => !passageIds.has(id));
    if (unknownPassageIds.length) fail(`${at} cites ${unknownPassageIds.length} passage ids that were not supplied`);

    normalized.push({
      questionType: candidate.questionType,
      direction,
      answerLanguageTag,
      prompt,
      choices,
      correctAnswer,
      supportingPassageIds: [...candidate.supportingPassageIds],
    });
  });

  return normalized;
}
