import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

export type StudyPair = {
  id: string;
  isPrimary: boolean;
  targetLanguageTag: string;
  referenceLanguageTag: string;
};

export type LearningDirection = 'recognition' | 'recall';

export type LearningCard = {
  answerLanguageTag: string;
  direction: LearningDirection;
  id: string;
  learningLanguageId: string;
  senseId: string;
};

export type TranslationLanguageUsage = {
  answerLanguageTag: string;
  lastUsedAt: string;
  learningLanguageTag: string;
  senseId: string;
};

export type AnswerLanguageResolution =
  | {
      answerLanguageTag: string;
      confirmationRequired: false;
      confidence: 'confirmed';
      editable: false;
      source: 'adapter';
    }
  | {
      answerLanguageTag: string;
      confirmationRequired: false;
      confidence: 'suggested';
      editable: true;
      source: 'detector';
    }
  | {
      answerLanguageTag: string | null;
      confirmationRequired: true;
      confidence: 'fallback';
      editable: true;
      source: 'detector' | 'preferred';
    };

export type AnswerLanguageResolutionOptions = {
  adapterAnswerLanguageTag?: string;
  detectedAnswerLanguageTag?: string;
  detectionConfidence?: number;
  detectionReliable?: boolean;
  preferredAnswerLanguageTag?: string;
};

export type LanguagePair = {
  answerLanguageTag: string;
  learningLanguageTag: string;
};

export type ManualCapture = {
  example: string | null;
  expression: string;
  referenceLanguageTag: string;
  senseCreated: boolean;
  targetLanguageTag: string;
  translation: string;
  vocabularyEntryId: string;
  vocabularyEntryCreated: boolean;
};

export type StudyPairResolutionOptions = {
  adapterLanguages?: {
    referenceLanguageTag: string;
    targetLanguageTag: string;
  };
  detectedTargetLanguageTag?: string;
  detectionReliable?: boolean;
  explicitStudyPairId?: string;
  rememberedStudyPairId?: string;
};

export type StudyPairResolution =
  | { kind: 'choice-required' }
  | { kind: 'resolved'; studyPair: StudyPair };

export type LearningEligibleVocabularyEntry = {
  studyPairId: string;
  suspended: boolean;
};

export type ScheduledReviewRating = 'again' | 'hard' | 'good' | 'easy';

export type RecognitionReviewEvent = {
  id: string;
  occurredAt: string;
  rating: ScheduledReviewRating;
};

export type RecognitionCard = {
  createdAt: string;
  events: RecognitionReviewEvent[];
  expression: string;
  id: string;
  referenceLanguageTag: string;
  senseId: string;
  studyPairId: string;
  suspended: boolean;
  targetLanguageTag: string;
  translations: string[];
};

export type RecognitionChoiceCard = RecognitionCard & {
  answerLanguageTag: string;
  direction: LearningDirection;
  learningLanguageId: string;
};

export type RecognitionChoice = {
  correct: boolean;
  senseId: string;
  text: string;
};

export const scheduledReviewRetention = 0.9;

const recognitionScheduler = fsrs(generatorParameters({
  enable_fuzz: false,
  request_retention: scheduledReviewRetention,
}));

const fsrsRatings = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

export function canonicalLanguageTag(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue.includes('_')) {
    return null;
  }

  try {
    return new Intl.Locale(trimmedValue).toString();
  } catch {
    return null;
  }
}

export function resolveAnswerLanguage(options: AnswerLanguageResolutionOptions): AnswerLanguageResolution {
  const adapterAnswerLanguageTag = options.adapterAnswerLanguageTag
    ? canonicalLanguageTag(options.adapterAnswerLanguageTag)
    : null;

  if (adapterAnswerLanguageTag) {
    return {
      answerLanguageTag: adapterAnswerLanguageTag,
      confirmationRequired: false,
      confidence: 'confirmed',
      editable: false,
      source: 'adapter',
    };
  }

  const detectedAnswerLanguageTag = options.detectedAnswerLanguageTag
    ? canonicalLanguageTag(options.detectedAnswerLanguageTag)
    : null;

  if (detectedAnswerLanguageTag && options.detectionReliable && (options.detectionConfidence ?? 0) > 0) {
    return {
      answerLanguageTag: detectedAnswerLanguageTag,
      confirmationRequired: false,
      confidence: 'suggested',
      editable: true,
      source: 'detector',
    };
  }

  return {
    answerLanguageTag: options.preferredAnswerLanguageTag
      ? canonicalLanguageTag(options.preferredAnswerLanguageTag)
      : null,
    confirmationRequired: true,
    confidence: 'fallback',
    editable: true,
    source: detectedAnswerLanguageTag ? 'detector' : 'preferred',
  };
}

export function deriveLanguagePairs(usages: TranslationLanguageUsage[]): LanguagePair[] {
  const pairs = new Map<string, LanguagePair>();

  for (const usage of usages) {
    const learningLanguageTag = canonicalLanguageTag(usage.learningLanguageTag);
    const answerLanguageTag = canonicalLanguageTag(usage.answerLanguageTag);

    if (learningLanguageTag && answerLanguageTag) {
      pairs.set(`${learningLanguageTag}\u0000${answerLanguageTag}`, {
        answerLanguageTag,
        learningLanguageTag,
      });
    }
  }

  return [...pairs.values()].sort((first, second) =>
    first.learningLanguageTag.localeCompare(second.learningLanguageTag)
    || first.answerLanguageTag.localeCompare(second.answerLanguageTag));
}

export function preferredAnswerLanguage(
  usages: TranslationLanguageUsage[],
  learningLanguageTag: string,
): string | null {
  const canonicalLearningLanguageTag = canonicalLanguageTag(learningLanguageTag);

  if (!canonicalLearningLanguageTag) {
    return null;
  }

  const candidates = new Map<string, { lastUsedAt: string; senseIds: Set<string> }>();

  for (const usage of usages) {
    if (canonicalLanguageTag(usage.learningLanguageTag) !== canonicalLearningLanguageTag) {
      continue;
    }

    const answerLanguageTag = canonicalLanguageTag(usage.answerLanguageTag);

    if (!answerLanguageTag) {
      continue;
    }

    const candidate = candidates.get(answerLanguageTag) ?? { lastUsedAt: usage.lastUsedAt, senseIds: new Set<string>() };
    candidate.senseIds.add(usage.senseId);
    candidate.lastUsedAt = candidate.lastUsedAt > usage.lastUsedAt ? candidate.lastUsedAt : usage.lastUsedAt;
    candidates.set(answerLanguageTag, candidate);
  }

  return [...candidates.entries()]
    .sort(([firstTag, first], [secondTag, second]) =>
      second.senseIds.size - first.senseIds.size
      || second.lastUsedAt.localeCompare(first.lastUsedAt)
      || firstTag.localeCompare(secondTag))[0]?.[0] ?? null;
}

export function requireSingleLearningLanguage(cards: LearningCard[]): string | null {
  const learningLanguageIds = new Set(cards.map((card) => card.learningLanguageId));

  if (learningLanguageIds.size > 1) {
    throw new Error('A session cannot mix Learning Languages.');
  }

  return learningLanguageIds.values().next().value ?? null;
}

export function languageName(tag: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
}

export function studyPairLabel(pair: Pick<StudyPair, 'targetLanguageTag' | 'referenceLanguageTag'>): string {
  return `${languageName(pair.targetLanguageTag)} → ${languageName(pair.referenceLanguageTag)}`;
}

export function isVocabularyEntryLearningEligible(entry: LearningEligibleVocabularyEntry, activeStudyPairId: string): boolean {
  return entry.studyPairId === activeStudyPairId && !entry.suspended;
}

export function deriveRecognitionCardSchedule(card: Pick<RecognitionCard, 'createdAt' | 'events'>): Card {
  return [...card.events]
    .sort((first, second) => first.occurredAt.localeCompare(second.occurredAt) || first.id.localeCompare(second.id))
    .reduce<Card>(
      (schedule, event) => recognitionScheduler.next(schedule, new Date(event.occurredAt), fsrsRatings[event.rating]).card,
      createEmptyCard(new Date(card.createdAt)),
    );
}

export function selectDueRecognitionCards(cards: RecognitionCard[], activeStudyPairId: string, now = new Date()): RecognitionCard[] {
  return cards
    .filter((card) => isVocabularyEntryLearningEligible(card, activeStudyPairId))
    .filter((card) => deriveRecognitionCardSchedule(card).due.getTime() <= now.getTime())
    .sort((first, second) => {
      const dueDifference = deriveRecognitionCardSchedule(first).due.getTime() - deriveRecognitionCardSchedule(second).due.getTime();
      return dueDifference || first.id.localeCompare(second.id);
    });
}

function translationIdentity(value: string): string | null {
  const identity = value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und').replaceAll('\u03c2', '\u03c3');

  return identity || null;
}

function typedRecallAnswerIdentity(value: string): string | null {
  const identity = value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/^[.,!?;:¿¡]+/u, '')
    .replace(/[.,!?;:¿¡]+$/u, '')
    .trim()
    .replace(/[\u2018\u2019\u02BC]/gu, "'")
    .replace(/[\u2011\u2013\u2014]/gu, '-')
    .toLocaleLowerCase('und')
    .replaceAll('\u03c2', '\u03c3');

  return identity || null;
}

export function isTypedRecallAnswerCorrect(answer: string, expression: string): boolean {
  const answerIdentity = typedRecallAnswerIdentity(answer);
  const expressionIdentity = typedRecallAnswerIdentity(expression);

  return answerIdentity !== null && answerIdentity === expressionIdentity;
}

type RecognitionTranslation = { identity: string; text: string };

function compareStable(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function representativeTranslations(translations: string[]): RecognitionTranslation[] {
  const representatives = new Map<string, RecognitionTranslation>();

  for (const text of translations) {
    const identity = translationIdentity(text);

    if (!identity) {
      continue;
    }

    const existing = representatives.get(identity);

    if (!existing || compareStable(text, existing.text) < 0) {
      representatives.set(identity, { identity, text });
    }
  }

  return [...representatives.values()].sort((first, second) =>
    compareStable(first.identity, second.identity) || compareStable(first.text, second.text));
}

export function selectRecognitionChoices(
  currentCard: RecognitionChoiceCard,
  cards: RecognitionChoiceCard[],
): RecognitionChoice[] | null {
  const currentAnswerLanguageTag = canonicalLanguageTag(currentCard.answerLanguageTag);
  const correctAnswer = representativeTranslations(currentCard.translations)[0];

  if (!currentAnswerLanguageTag || !correctAnswer) {
    return null;
  }

  const candidateTranslationsBySense = new Map<string, RecognitionTranslation[]>();

  for (const card of cards) {
    if (card.learningLanguageId !== currentCard.learningLanguageId
      || card.senseId === currentCard.senseId
      || card.suspended
      || canonicalLanguageTag(card.answerLanguageTag) !== currentAnswerLanguageTag) {
      continue;
    }

    const translations = candidateTranslationsBySense.get(card.senseId) ?? [];
    translations.push(...representativeTranslations(card.translations));
    candidateTranslationsBySense.set(card.senseId, translations);
  }

  const selectedIdentities = new Set<string>([correctAnswer.identity]);
  const distractors: RecognitionChoice[] = [];

  for (const [senseId, translations] of candidateTranslationsBySense.entries()) {
    const representative = representativeTranslations(translations.map((translation) => translation.text))
      .find((translation) => !selectedIdentities.has(translation.identity));

    if (!representative) {
      continue;
    }

    selectedIdentities.add(representative.identity);
    distractors.push({ correct: false, senseId, text: representative.text });

    if (distractors.length === 3) {
      break;
    }
  }

  if (distractors.length < 3) {
    return null;
  }

  return [
    { correct: true, senseId: currentCard.senseId, text: correctAnswer.text },
    ...distractors,
  ].sort((first, second) => compareStable(first.senseId, second.senseId));
}

function matchingLanguageTag(first: string, second: string): boolean {
  const canonicalFirst = canonicalLanguageTag(first);
  const canonicalSecond = canonicalLanguageTag(second);

  return canonicalFirst !== null && canonicalFirst === canonicalSecond;
}

export function resolveStudyPair(
  studyPairs: StudyPair[],
  options: StudyPairResolutionOptions,
): StudyPairResolution {
  const adapterPair = options.adapterLanguages
    ? studyPairs.find((pair) =>
      matchingLanguageTag(pair.targetLanguageTag, options.adapterLanguages!.targetLanguageTag)
      && matchingLanguageTag(pair.referenceLanguageTag, options.adapterLanguages!.referenceLanguageTag))
    : undefined;

  if (adapterPair) {
    return { kind: 'resolved', studyPair: adapterPair };
  }

  const rememberedPair = studyPairs.find((pair) => pair.id === options.rememberedStudyPairId);

  if (rememberedPair) {
    return { kind: 'resolved', studyPair: rememberedPair };
  }

  if (options.detectionReliable && options.detectedTargetLanguageTag) {
    const detectedPair = studyPairs.find((pair) =>
      pair.isPrimary && matchingLanguageTag(pair.targetLanguageTag, options.detectedTargetLanguageTag!));

    if (detectedPair) {
      return { kind: 'resolved', studyPair: detectedPair };
    }
  }

  const explicitPair = studyPairs.find((pair) => pair.id === options.explicitStudyPairId);

  return explicitPair
    ? { kind: 'resolved', studyPair: explicitPair }
    : { kind: 'choice-required' };
}
