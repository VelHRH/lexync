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
