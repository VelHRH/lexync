import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getEncoding } from 'js-tiktoken';

export const PASSAGE_SCHEMA_VERSION = 1;
export const PASSAGE_CHUNK_SIZE = 800;
export const PASSAGE_CHUNK_OVERLAP = 100;

const tokenizer = getEncoding('cl100k_base');
const MAX_DIRECT_TOKEN_COUNT_LENGTH = 8_192;
const MAX_LANGCHAIN_INPUT_LENGTH = 65_536;
const DENSE_TOKEN_SAMPLE_LENGTH = 1_024;
const DENSE_TOKEN_TARGET = 780;
const MIN_TARGET_CHUNK_TOKENS = 600;
const MAX_TOKEN_COUNT_CACHE_ENTRIES = 512;
const tokenCountCache = new Map<string, number>();

type SplitChunk = {
  startOffset: number;
  endOffset: number;
  text: string;
};

function previousCodePointBoundary(text: string, index: number): number {
  return index > 0 && index < text.length && (text.charCodeAt(index) & 0xfc00) === 0xdc00 ? index - 1 : index;
}

function nextCodePointBoundary(text: string, index: number): number {
  if (index >= text.length) return text.length;
  return index < text.length - 1 && (text.charCodeAt(index) & 0xfc00) === 0xd800 ? index + 2 : index + 1;
}

function countTokens(text: string): number {
  const cached = tokenCountCache.get(text);
  if (cached !== undefined) return cached;
  const count = tokenizer.encode(text).length;
  if (tokenCountCache.size >= MAX_TOKEN_COUNT_CACHE_ENTRIES) tokenCountCache.delete(tokenCountCache.keys().next().value as string);
  tokenCountCache.set(text, count);
  return count;
}

function denseTokenDensity(text: string): number {
  const sampleCount = Math.min(5, Math.ceil(text.length / DENSE_TOKEN_SAMPLE_LENGTH));
  let maximumDensity = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const availableStart = Math.max(0, text.length - DENSE_TOKEN_SAMPLE_LENGTH);
    const startOffset = sampleCount === 1 ? 0 : Math.floor((availableStart * index) / (sampleCount - 1));
    const sample = text.slice(startOffset, startOffset + DENSE_TOKEN_SAMPLE_LENGTH);
    maximumDensity = Math.max(maximumDensity, countTokens(sample) / Math.max(sample.length, 1));
  }
  return Math.max(maximumDensity, 1 / DENSE_TOKEN_SAMPLE_LENGTH);
}

function splitHomogeneousParagraph(text: string): SplitChunk[] | null {
  if (text.length < DENSE_TOKEN_SAMPLE_LENGTH || text.charCodeAt(0) > 0x7f) return null;
  const firstCharacter = text.charCodeAt(0);
  let heterogeneousTail = false;
  for (let index = 1; index < text.length; index += 1) {
    if (text.charCodeAt(index) !== firstCharacter && index < text.length - 64) return null;
    if (text.charCodeAt(index) !== firstCharacter) heterogeneousTail = true;
  }
  const sample = text.slice(0, DENSE_TOKEN_SAMPLE_LENGTH);
  const density = countTokens(sample) / sample.length;
  const chunkLength = Math.max(1, Math.floor((heterogeneousTail ? 700 : DENSE_TOKEN_TARGET) / density));
  const overlapLength = Math.max(1, Math.min(chunkLength - 1, Math.round(PASSAGE_CHUNK_OVERLAP / density)));
  const advance = Math.max(1, chunkLength - overlapLength);
  const chunks: SplitChunk[] = [];
  for (let startOffset = 0; startOffset < text.length; startOffset += advance) {
    const endOffset = Math.min(text.length, startOffset + chunkLength);
    chunks.push({ startOffset, endOffset, text: text.slice(startOffset, endOffset) });
    if (endOffset >= text.length) break;
  }
  return chunks;
}

function splitDenseParagraph(text: string): SplitChunk[] {
  const homogeneousChunks = splitHomogeneousParagraph(text);
  if (homogeneousChunks) return homogeneousChunks;
  const density = denseTokenDensity(text);
  const chunkLength = Math.max(1, Math.floor((DENSE_TOKEN_TARGET * 0.9) / density));
  const overlapLength = Math.max(1, Math.min(chunkLength - 1, Math.round(PASSAGE_CHUNK_OVERLAP / density)));
  const advance = Math.max(1, chunkLength - overlapLength);
  const chunks: SplitChunk[] = [];
  let startOffset = 0;
  while (startOffset < text.length) {
    let endOffset = Math.min(text.length, startOffset + chunkLength);
    endOffset = previousCodePointBoundary(text, endOffset);
    if (endOffset <= startOffset) endOffset = nextCodePointBoundary(text, startOffset);
    let chunk = text.slice(startOffset, endOffset);
    let tokenCount = countTokens(chunk);
    while (tokenCount > PASSAGE_CHUNK_SIZE && endOffset > startOffset) {
      const candidateLength = Math.max(1, Math.floor((chunk.length * PASSAGE_CHUNK_SIZE) / tokenCount));
      endOffset = previousCodePointBoundary(text, startOffset + candidateLength);
      if (endOffset <= startOffset) endOffset = nextCodePointBoundary(text, startOffset);
      chunk = text.slice(startOffset, endOffset);
      tokenCount = countTokens(chunk);
    }
    chunks.push({ startOffset, endOffset, text: chunk });
    if (endOffset >= text.length) break;
    const nextStartOffset = previousCodePointBoundary(text, startOffset + advance);
    startOffset = nextStartOffset < endOffset ? nextStartOffset : previousCodePointBoundary(text, endOffset - 1);
    if (startOffset <= chunks.at(-1)!.startOffset) startOffset = nextCodePointBoundary(text, chunks.at(-1)!.startOffset);
  }
  return chunks;
}

function isSeparatorRich(text: string): boolean {
  return /[\s.,!?;:。！？；：、]/u.test(text);
}

function splitParagraph(text: string): Promise<SplitChunk[]> {
  const separatorRich = isSeparatorRich(text);
  if (separatorRich && text.length <= MAX_DIRECT_TOKEN_COUNT_LENGTH && countTokens(text) <= PASSAGE_CHUNK_SIZE) {
    return Promise.resolve([{ startOffset: 0, endOffset: text.length, text }]);
  }
  if (!separatorRich || text.length > MAX_LANGCHAIN_INPUT_LENGTH) return Promise.resolve(splitDenseParagraph(text));

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: PASSAGE_CHUNK_SIZE,
    chunkOverlap: PASSAGE_CHUNK_OVERLAP,
    lengthFunction: countTokens,
    separators: ['\n', '。', '！', '？', '；', '：', '、', '. ', '! ', '? ', ' ', ''],
  });
  return splitter.splitText(text).then((chunks) => {
    const tokenCounts = chunks.map(countTokens);
    if (
      chunks.some((chunk) => !chunk)
      || tokenCounts.some((tokenCount) => tokenCount > PASSAGE_CHUNK_SIZE)
      || tokenCounts.slice(0, -1).some((tokenCount) => tokenCount < MIN_TARGET_CHUNK_TOKENS)
    ) return splitDenseParagraph(text);
    const splitChunks: SplitChunk[] = [];
    let searchStart = 0;
    for (const chunk of chunks) {
      const startOffset = text.indexOf(chunk, searchStart);
      if (startOffset < 0) return splitDenseParagraph(text);
      const endOffset = startOffset + chunk.length;
      splitChunks.push({ startOffset, endOffset, text: chunk });
      searchStart = startOffset + 1;
    }
    if (splitChunks.at(-1)?.endOffset !== text.length) return splitDenseParagraph(text);
    return splitChunks;
  });
}

export type LearningMaterialPassage = {
  ordinal: number;
  startOffset: number;
  endOffset: number;
  text: string;
};

export function normalizeLearningMaterialText(sourceText: string): string {
  return sourceText
    .normalize('NFC')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function codePointOffsetTable(text: string): Uint32Array {
  const offsets = new Uint32Array(text.length + 1);
  let codePointOffset = 0;
  let codeUnitOffset = 0;
  while (codeUnitOffset < text.length) {
    offsets[codeUnitOffset] = codePointOffset;
    const codeUnit = text.charCodeAt(codeUnitOffset);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && codeUnitOffset + 1 < text.length) {
      offsets[codeUnitOffset + 1] = codePointOffset;
      codeUnitOffset += 2;
    } else {
      codeUnitOffset += 1;
    }
    codePointOffset += 1;
  }
  offsets[text.length] = codePointOffset;
  return offsets;
}

export async function splitLearningMaterial(normalizedText: string): Promise<LearningMaterialPassage[]> {
  const passages: LearningMaterialPassage[] = [];
  const codePointOffsets = codePointOffsetTable(normalizedText);
  const paragraphSeparator = /\n{2,}/gu;
  let paragraphStart = 0;
  let separatorMatch: RegExpExecArray | null;

  const processParagraph = async (paragraphEnd: number): Promise<void> => {
    const paragraph = normalizedText.slice(paragraphStart, paragraphEnd);
    if (!paragraph.trim()) return;
    const chunks = await splitParagraph(paragraph);
    for (const chunk of chunks) {
      const startOffset = paragraphStart + chunk.startOffset;
      const endOffset = paragraphStart + chunk.endOffset;
      if (normalizedText.slice(startOffset, endOffset) !== chunk.text) {
        throw new Error('Learning Material passage offsets could not be verified.');
      }
      passages.push({
        ordinal: passages.length,
        startOffset: codePointOffsets[startOffset],
        endOffset: codePointOffsets[endOffset],
        text: chunk.text,
      });
    }
  };

  while ((separatorMatch = paragraphSeparator.exec(normalizedText)) !== null) {
    await processParagraph(separatorMatch.index);
    paragraphStart = separatorMatch.index + separatorMatch[0].length;
  }
  await processParagraph(normalizedText.length);

  if (!passages.length) throw new Error('Learning Material passages could not be created.');
  return passages;
}
