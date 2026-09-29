import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export const PASSAGE_SCHEMA_VERSION = 1;
export const PASSAGE_CHUNK_SIZE = 3_200;
export const PASSAGE_CHUNK_OVERLAP = 400;

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

export async function splitLearningMaterial(normalizedText: string): Promise<LearningMaterialPassage[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: PASSAGE_CHUNK_SIZE,
    chunkOverlap: PASSAGE_CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });
  const paragraphs = normalizedText.split(/\n{2,}/u);
  const passages: LearningMaterialPassage[] = [];
  let searchStart = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      searchStart += paragraph.length + 2;
      continue;
    }

    const chunks = await splitter.splitText(paragraph);
    for (const text of chunks) {
      const startOffset = normalizedText.indexOf(text, searchStart);
      if (startOffset < 0) throw new Error('Learning Material passage offsets could not be determined.');
      const endOffset = startOffset + text.length;
      passages.push({ ordinal: passages.length, startOffset, endOffset, text });
      searchStart = Math.max(startOffset + 1, endOffset - PASSAGE_CHUNK_OVERLAP);
    }

    const paragraphEnd = normalizedText.indexOf(paragraph, searchStart);
    searchStart = paragraphEnd >= 0 ? paragraphEnd + paragraph.length : searchStart;
  }

  if (!passages.length) throw new Error('Learning Material passages could not be created.');
  return passages;
}

