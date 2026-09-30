import { expect, test } from '@playwright/test';
import {
  EMBEDDING_DIMENSION,
  GeminiEmbeddingProvider,
  type GeminiEmbeddingClient,
} from '../../apps/web/lib/learning-materials/embeddings';

test('Gemini document embeddings preserve order across API-sized batches', async () => {
  const calls: string[][] = [];
  const client: GeminiEmbeddingClient = {
    models: {
      embedContent: async ({ contents }) => {
        const batch = [...contents];
        calls.push(batch);
        return {
          embeddings: batch.map((text) => ({
            values: Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => index === 0 ? Number(text.slice(5)) : 0),
          })),
        };
      },
    },
  };
  const provider = new GeminiEmbeddingProvider('test-key', client);
  const texts = Array.from({ length: 205 }, (_, index) => `text-${index}`);

  const embeddings = await provider.embedDocuments(texts);

  expect(calls.map((batch) => batch.length)).toEqual([100, 100, 5]);
  expect(embeddings.map((embedding) => embedding[0])).toEqual(texts.map((text) => Number(text.slice(5))));
});
