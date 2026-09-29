import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

export const EMBEDDING_DIMENSION = 768;
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export type EmbeddingProvider = {
  readonly model: string;
  readonly dimension: number;
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
};

function deterministicVector(text: string): number[] {
  const values: number[] = [];
  for (let index = 0; index < EMBEDDING_DIMENSION; index += 1) {
    const digest = createHash('sha256').update(`${index}\u0000${text}`).digest();
    const unsigned = digest.readUInt32BE(0);
    values.push(unsigned / 2_147_483_647 - 1);
  }
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / length);
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'lexync-deterministic-768-v1';
  readonly dimension = EMBEDDING_DIMENSION;

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return texts.map(deterministicVector);
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = GEMINI_EMBEDDING_MODEL;
  readonly dimension = EMBEDDING_DIMENSION;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    const response = await this.client.models.embedContent({
      model: this.model,
      contents: [...texts],
      config: {
        outputDimensionality: this.dimension,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    });
    const embeddings = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length !== this.dimension)) {
      throw new Error('The embedding provider returned an unexpected result.');
    }
    return embeddings;
  }
}

export class LangChainGeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = GEMINI_EMBEDDING_MODEL;
  readonly dimension = EMBEDDING_DIMENSION;
  private readonly provider: GoogleGenerativeAIEmbeddings;

  constructor(apiKey: string) {
    this.provider = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: this.model,
      outputDimensionality: this.dimension,
      taskType: 'RETRIEVAL_DOCUMENT' as never,
    });
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    const embeddings = await this.provider.embedDocuments([...texts]);
    if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length !== this.dimension)) {
      throw new Error('The embedding provider returned an unexpected result.');
    }
    return embeddings;
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.LEXYNC_EMBEDDING_PROVIDER;
  if (provider === 'deterministic') return new DeterministicEmbeddingProvider();
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for the Gemini embedding provider.');
    return new GeminiEmbeddingProvider(apiKey);
  }
  throw new Error('LEXYNC_EMBEDDING_PROVIDER must be explicitly set to deterministic or gemini.');
}
