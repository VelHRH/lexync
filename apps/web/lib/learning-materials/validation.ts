import { languageName } from '@lexync/domain';

export const MAX_LEARNING_MATERIAL_BYTES = 1_048_576;

export const learningMaterialMessages = {
  empty: 'Learning Material files cannot be empty.',
  extension: 'Learning Material files must use the .txt extension.',
  utf8: 'Learning Material files must be valid UTF-8 text.',
  readable: 'Learning Material files must contain readable text.',
  size: 'Learning Material files must be 1 MiB or smaller.',
} as const;

export type ValidatedLearningMaterial = {
  fileName: string;
  rawBytes: Uint8Array;
  sourceText: string;
};

export class LearningMaterialValidationError extends Error {
  constructor(public readonly message: string) {
    super(message);
  }
}

export class LearningMaterialLanguageError extends Error {
  constructor(public readonly message: string) {
    super(message);
  }
}

export function learningMaterialLanguageMessage(learningLanguageTag: string, detectedLanguage: string | null): string {
  const expected = languageName(learningLanguageTag);
  const opening = detectedLanguage
    ? `This Learning Material is written in ${languageName(detectedLanguage)}, not ${expected}.`
    : `This Learning Material does not look like it is written in ${expected}.`;
  return `${opening} Add it to the matching Learning Language, or delete it.`;
}
function readableFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? 'learning-material.txt';
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeName || 'learning-material.txt';
}

function isReadableText(text: string): boolean {
  if (text.includes('\u0000')) return false;

  let controlCount = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(codePoint)) || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      controlCount += 1;
    }
  }

  return controlCount === 0 || controlCount / Math.max(text.length, 1) <= 0.1;
}

export async function validateLearningMaterial(file: File): Promise<ValidatedLearningMaterial> {
  if (!file.name.toLowerCase().endsWith('.txt')) {
    throw new LearningMaterialValidationError(learningMaterialMessages.extension);
  }

  const rawBytes = new Uint8Array(await file.arrayBuffer());
  if (rawBytes.byteLength > MAX_LEARNING_MATERIAL_BYTES) {
    throw new LearningMaterialValidationError(learningMaterialMessages.size);
  }

  let sourceText: string;
  try {
    sourceText = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  } catch {
    throw new LearningMaterialValidationError(learningMaterialMessages.utf8);
  }

  if (!sourceText.replace(/^\uFEFF/, '').trim()) {
    throw new LearningMaterialValidationError(learningMaterialMessages.empty);
  }

  if (!isReadableText(sourceText)) {
    throw new LearningMaterialValidationError(learningMaterialMessages.readable);
  }

  return { fileName: readableFileName(file.name), rawBytes, sourceText };
}
