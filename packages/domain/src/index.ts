export type StudyPair = {
  id: string;
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

export function languageName(tag: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
}

export function studyPairLabel(pair: Pick<StudyPair, 'targetLanguageTag' | 'referenceLanguageTag'>): string {
  return `${languageName(pair.targetLanguageTag)} → ${languageName(pair.referenceLanguageTag)}`;
}
