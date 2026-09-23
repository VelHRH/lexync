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

function normalizeClozeText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isClozeWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

export function buildClozePrompt(example: string, expression: string): string | null {
  const normalizedExample = normalizeClozeText(example);
  const normalizedExpression = normalizeClozeText(expression);

  if (!normalizedExample || !normalizedExpression) {
    return null;
  }

  const occurrencePattern = new RegExp(escapedRegExp(normalizedExpression), 'giu');
  const occurrences: RegExpExecArray[] = [];
  let occurrence: RegExpExecArray | null;

  while ((occurrence = occurrencePattern.exec(normalizedExample)) !== null) {
    const startCharacter = [...normalizedExample.slice(0, occurrence.index)].at(-1);
    const endCharacter = [...normalizedExample.slice(occurrence.index + occurrence[0].length)][0];

    if (!isClozeWordCharacter(startCharacter) && !isClozeWordCharacter(endCharacter)) {
      occurrences.push(occurrence);
    }
  }

  if (occurrences.length !== 1) {
    return null;
  }

  const match = occurrences[0];
  if (!match) {
    return null;
  }

  return `${normalizedExample.slice(0, match.index)}_____${normalizedExample.slice(match.index + match[0].length)}`;
}

export function clozeQuestionTargetCount(sessionSize: number, eligibleCount: number): number {
  const normalizedSessionSize = Number.isFinite(sessionSize) ? Math.floor(sessionSize) : 0;
  const normalizedEligibleCount = Number.isFinite(eligibleCount) ? Math.floor(eligibleCount) : 0;

  if (normalizedSessionSize < 2 || normalizedEligibleCount <= 0) {
    return 0;
  }

  return Math.min(normalizedEligibleCount, Math.floor(normalizedSessionSize / 2));
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
