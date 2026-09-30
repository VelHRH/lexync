import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { Embeddings } from '@langchain/core/embeddings';

export const EMBEDDING_DIMENSION = 768;
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export type EmbeddingProvider = {
  readonly model: string;
  readonly dimension: number;
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};

export type GeminiEmbeddingClient = {
  readonly models: {
    embedContent(parameters: {
      model: string;
      contents: string[];
      config: {
        outputDimensionality: number;
        taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
      };
    }): Promise<{
      embeddings?: Array<{ values?: number[] }>;
    }>;
  };
};

const GEMINI_DOCUMENT_BATCH_SIZE = 100;

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

  async embedQuery(text: string): Promise<number[]> {
    return deterministicVector(text);
  }
}

class OfficialGeminiEmbeddings extends Embeddings {
  private readonly client: GeminiEmbeddingClient;

  constructor(apiKey: string, client?: GeminiEmbeddingClient) {
    super({});
    this.client = client ?? new GoogleGenAI({ apiKey });
  }

  private async embed(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
    const response = await this.client.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: texts,
      config: {
        outputDimensionality: EMBEDDING_DIMENSION,
        taskType,
      },
    });
    const embeddings = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSION)) {
      throw new Error('The embedding provider returned an unexpected result.');
    }
    return embeddings;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += GEMINI_DOCUMENT_BATCH_SIZE) {
      embeddings.push(...await this.embed(texts.slice(start, start + GEMINI_DOCUMENT_BATCH_SIZE), 'RETRIEVAL_DOCUMENT'));
    }
    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text], 'RETRIEVAL_QUERY');
    return embedding;
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model = GEMINI_EMBEDDING_MODEL;
  readonly dimension = EMBEDDING_DIMENSION;
  private readonly provider: OfficialGeminiEmbeddings;

  constructor(apiKey: string, client?: GeminiEmbeddingClient) {
    this.provider = new OfficialGeminiEmbeddings(apiKey, client);
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return this.provider.embedDocuments([...texts]);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.provider.embedQuery(text);
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
