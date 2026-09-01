import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

export type StudyPair = {
  id: string;
  isPrimary: boolean;
  targetLanguageTag: string;
  referenceLanguageTag: string;
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
