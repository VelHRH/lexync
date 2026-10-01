import { canonicalLanguageTag } from '@lexync/domain';
import type { DynamicLessonQuestionCandidate } from './generation';

export class DynamicLessonGenerationError extends Error {}

export type ValidatedDynamicLessonQuestion = DynamicLessonQuestionCandidate;

export type DynamicLessonValidationContext = {
  minQuestions: number;
  maxQuestions: number;
  learningLanguageTag: string;
  answerLanguageTag: string;
  passages: readonly { id: string }[];
};

function fail(): never {
  throw new DynamicLessonGenerationError('Generated Lesson Questions are invalid.');
}

export function validateDynamicLessonQuestions(
  candidates: readonly DynamicLessonQuestionCandidate[],
  context: DynamicLessonValidationContext,
): ValidatedDynamicLessonQuestion[] {
  if (candidates.length < context.minQuestions || candidates.length > context.maxQuestions) fail();

  const passageIds = new Set(context.passages.map((passage) => passage.id));
  const promptKeys = new Set<string>();
  const normalized: ValidatedDynamicLessonQuestion[] = [];

  for (const candidate of candidates) {
    const prompt = candidate.prompt.trim();
    if (!prompt) fail();
    const promptKey = prompt.toLowerCase();
    if (promptKeys.has(promptKey)) fail();
    promptKeys.add(promptKey);

    const choices = candidate.choices.map((choice) => choice.trim());
    if (choices.length < 2 || choices.length > 4) fail();
    if (choices.some((choice) => !choice)) fail();
    if (new Set(choices).size !== choices.length) fail();

    const correctAnswer = candidate.correctAnswer.trim();
    if (!correctAnswer) fail();
    if (choices.filter((choice) => choice === correctAnswer).length !== 1) fail();

    let direction: 'recognition' | 'recall' | null = null;
    let answerLanguageTag: string | null = null;

    if (candidate.questionType === 'translation') {
      if (candidate.direction !== 'recognition' && candidate.direction !== 'recall') fail();
      const canonicalAnswerLanguageTag = candidate.answerLanguageTag ? canonicalLanguageTag(candidate.answerLanguageTag) : null;
      if (!canonicalAnswerLanguageTag || canonicalAnswerLanguageTag !== context.answerLanguageTag) fail();
      direction = candidate.direction;
      answerLanguageTag = canonicalAnswerLanguageTag;
    } else if (candidate.questionType === 'cloze') {
      if (candidate.direction !== null || candidate.answerLanguageTag !== null) fail();
    } else {
      fail();
    }

    if (!candidate.supportingPassageIds.length || candidate.supportingPassageIds.some((id) => !passageIds.has(id))) fail();

    normalized.push({
      questionType: candidate.questionType,
      direction,
      answerLanguageTag,
      prompt,
      choices,
      correctAnswer,
      supportingPassageIds: [...candidate.supportingPassageIds],
    });
  }

  return normalized;
}
