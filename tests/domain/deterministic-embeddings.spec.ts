import { expect, test } from '@playwright/test';
import { DeterministicEmbeddingProvider, EMBEDDING_DIMENSION } from '../../apps/web/lib/learning-materials/embeddings';

function cosineSimilarity(first: number[], second: number[]): number {
  let dot = 0;
  for (let index = 0; index < first.length; index += 1) dot += first[index] * second[index];
  return dot;
}

function vectorLength(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

const passage = 'Marine biologists have long studied the migratory patterns of humpback whales as they travel thousands of kilometers between feeding grounds near the poles and warmer breeding waters closer to the equator. Each year, researchers attach satellite tags to a handful of whales to track their routes, recording ocean temperature, depth, and feeding behavior along the way. The data reveals that humpback whales rely on a combination of memory, magnetic sensing, and acoustic communication to navigate these vast distances accurately. Calves born during the winter breeding season must quickly learn to follow their mothers on the long journey back to colder waters once spring arrives. Conservationists use this migratory information to identify critical habitats that require protection from shipping traffic, industrial fishing, and offshore construction. Climate change is increasingly disrupting these patterns, as shifting ocean temperatures alter the availability of krill and small fish that whales depend on for energy during their migration. Understanding these changes helps policymakers design marine protected areas that account for seasonal movement rather than static boundaries.';

const relevantRequest = 'I would like to practise how conservationists and policymakers discuss construction, temperatures, communication, and availability increasingly.';

const irrelevantRequest = 'Describe your favorite recipe for baking sourdough bread at home.';

test.describe('Deterministic embedding provider (lexical signature)', () => {
  test('embeds the same text identically into a unit-length 768-dimensional vector', async () => {
    const provider = new DeterministicEmbeddingProvider();

    const first = await provider.embedQuery(passage);
    const second = await provider.embedQuery(passage);

    expect(first).toEqual(second);
    expect(first).toHaveLength(EMBEDDING_DIMENSION);
    expect(vectorLength(first)).toBeCloseTo(1, 6);
  });

  test('scores texts sharing most distinctive words at or above the relevance threshold', async () => {
    const provider = new DeterministicEmbeddingProvider();

    const passageVector = await provider.embedQuery(passage);
    const relevantVector = await provider.embedQuery(relevantRequest);

    expect(cosineSimilarity(passageVector, relevantVector)).toBeGreaterThanOrEqual(0.65);
  });

  test('scores texts sharing no distinctive words well below the relevance threshold', async () => {
    const provider = new DeterministicEmbeddingProvider();

    const passageVector = await provider.embedQuery(passage);
    const irrelevantVector = await provider.embedQuery(irrelevantRequest);

    expect(cosineSimilarity(passageVector, irrelevantVector)).toBeLessThan(0.3);
  });

  test('falls back to a whole-text unit vector when no token reaches the minimum signature length', async () => {
    const provider = new DeterministicEmbeddingProvider();

    const shortWordsOnly = 'I am ok to go up a bit.';
    const vector = await provider.embedQuery(shortWordsOnly);

    expect(vector).toHaveLength(EMBEDDING_DIMENSION);
    expect(vectorLength(vector)).toBeCloseTo(1, 6);
  });
});
