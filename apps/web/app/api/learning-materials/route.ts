import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createEmbeddingProvider } from '../../../lib/learning-materials/embeddings';
import {
  PASSAGE_SCHEMA_VERSION,
  normalizeLearningMaterialText,
  splitLearningMaterial,
} from '../../../lib/learning-materials/processing';
import {
  MAX_LEARNING_MATERIAL_BYTES,
  LearningMaterialValidationError,
  learningMaterialMessages,
  validateLearningMaterial,
} from '../../../lib/learning-materials/validation';

const safeProcessingError = 'Learning Material could not be prepared right now.';
const safeAuthError = 'Please sign in to manage Learning Materials.';
const MAX_MULTIPART_REQUEST_BYTES = MAX_LEARNING_MATERIAL_BYTES + 64 * 1024;

type MaterialRow = {
  id: string;
  file_name: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
};

function supabaseForRequest(request: Request): SupabaseClient | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase web configuration is incomplete.');

  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authenticatedClient(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return null;
  const authorization = request.headers.get('authorization') ?? '';
  const { data, error } = await client.auth.getUser(authorization.slice(7).trim());
  if (error || !data.user) return null;
  return { client, user: data.user };
}

function materialResponse(row: MaterialRow) {
  return {
    id: row.id,
    fileName: row.file_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function markFailed(client: SupabaseClient, materialId: string, learnerId: string) {
  await client
    .from('learning_materials')
    .update({ status: 'failed' })
    .eq('id', materialId)
    .eq('learner_id', learnerId);
}

export async function GET(request: Request) {
  try {
    const authenticated = await authenticatedClient(request);
    if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

    const learningLanguageId = new URL(request.url).searchParams.get('learningLanguageId');
    if (!learningLanguageId) return Response.json({ materials: [] });

    const { data, error } = await authenticated.client
      .from('learning_materials')
      .select('id,file_name,status,created_at')
      .eq('learner_id', authenticated.user.id)
      .eq('learning_language_id', learningLanguageId)
      .in('status', ['processing', 'ready'])
      .order('created_at', { ascending: false });
    if (error) throw error;

    return Response.json({ materials: (data as MaterialRow[]).map(materialResponse) });
  } catch {
    return Response.json({ error: safeProcessingError }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let authenticated: Awaited<ReturnType<typeof authenticatedClient>> = null;
  try {
    authenticated = await authenticatedClient(request);
  } catch {
    return Response.json({ error: safeProcessingError }, { status: 500 });
  }
  if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

  const contentLengthHeader = request.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')
    && contentLength !== null
    && Number.isSafeInteger(contentLength)
    && contentLength > MAX_MULTIPART_REQUEST_BYTES
  ) {
    return Response.json({ error: learningMaterialMessages.size }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: safeProcessingError }, { status: 400 });
  }
  const fileValue = formData.get('file');
  const learningLanguageId = formData.get('learningLanguageId');
  if (!(fileValue instanceof File) || typeof learningLanguageId !== 'string' || !learningLanguageId) {
    return Response.json({ error: safeProcessingError }, { status: 400 });
  }

  let materialId: string | null = null;
  let storagePath: string | null = null;
  let inserted = false;
  try {
    const validated = await validateLearningMaterial(fileValue);
    const { client, user } = authenticated;
    const { data: language, error: languageError } = await client
      .from('learning_languages')
      .select('id')
      .eq('id', learningLanguageId)
      .eq('learner_id', user.id)
      .maybeSingle();
    if (languageError || !language) return Response.json({ error: safeProcessingError }, { status: 400 });

    materialId = crypto.randomUUID();
    storagePath = `${user.id}/${learningLanguageId}/${materialId}/${validated.fileName}`;
    const { data: insertedRow, error: insertError } = await client
      .from('learning_materials')
      .insert({
        id: materialId,
        learner_id: user.id,
        learning_language_id: learningLanguageId,
        file_name: validated.fileName,
        storage_path: storagePath,
        byte_size: validated.rawBytes.byteLength,
        status: 'processing',
      })
      .select('id,file_name,status,created_at')
      .single();
    if (insertError || !insertedRow) throw insertError ?? new Error('Learning Material could not be registered.');
    inserted = true;

    const { error: uploadError } = await client.storage
      .from('learning-materials')
      .upload(storagePath, new Blob([validated.rawBytes as unknown as ArrayBuffer], { type: 'text/plain' }), {
        contentType: 'text/plain',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const normalizedText = normalizeLearningMaterialText(validated.sourceText);
    const passages = await splitLearningMaterial(normalizedText);
    const provider = createEmbeddingProvider();
    const embeddings = await provider.embedDocuments(passages.map((passage) => passage.text));
    const { data: completed, error: completionError } = await client.rpc('complete_learning_material', {
      p_material_id: materialId,
      p_normalized_text: normalizedText,
      p_embedding_model: provider.model,
      p_embedding_dimension: provider.dimension,
      p_passage_schema_version: PASSAGE_SCHEMA_VERSION,
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

    return Response.json({ material: materialResponse(completed as MaterialRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof LearningMaterialValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (inserted && materialId) await markFailed(authenticated.client, materialId, authenticated.user.id);
    else if (storagePath) await authenticated.client.storage.from('learning-materials').remove([storagePath]);
    return Response.json({ error: safeProcessingError }, { status: 500 });
  }
}
