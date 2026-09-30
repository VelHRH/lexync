import { type SupabaseClient } from '@supabase/supabase-js';
import { createEmbeddingProvider } from './embeddings';
import {
  PASSAGE_SCHEMA_VERSION,
  normalizeLearningMaterialText,
  splitLearningMaterial,
} from './processing';
import { learningMaterialMessages, LearningMaterialValidationError } from './validation';

export async function processLearningMaterial(
  client: SupabaseClient,
  materialId: string,
  processingVersion: number,
  sourceText: string,
) {
  const normalizedText = normalizeLearningMaterialText(sourceText);
  const passages = await splitLearningMaterial(normalizedText);
  const provider = createEmbeddingProvider();
  const embeddings = await provider.embedDocuments(passages.map((passage) => passage.text));
  const { data: completed, error: completionError } = await client.rpc('complete_learning_material', {
    p_material_id: materialId,
    p_normalized_text: normalizedText,
    p_embedding_model: provider.model,
    p_embedding_dimension: provider.dimension,
    p_passage_schema_version: PASSAGE_SCHEMA_VERSION,
    p_processing_version: processingVersion,
    p_passages: passages.map((passage, index) => ({
      ordinal: passage.ordinal,
      start_offset: passage.startOffset,
      end_offset: passage.endOffset,
      source_start: passage.startOffset,
      source_end: passage.endOffset,
      passage_text: passage.text,
      embedding_model: provider.model,
      embedding_dimension: provider.dimension,
      passage_schema_version: PASSAGE_SCHEMA_VERSION,
      embedding: embeddings[index],
    })),
  });
  if (completionError || !completed) throw completionError ?? new Error('Learning Material could not be completed.');
  return completed;
}

export async function decodeLearningMaterialSource(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LearningMaterialValidationError(learningMaterialMessages.utf8);
  }
}
