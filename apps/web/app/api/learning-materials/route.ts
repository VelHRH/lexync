import { processLearningMaterial } from '../../../lib/learning-materials/process';
import {
  authenticatedClient,
  failLearningMaterial,
  materialResponse,
  safeAuthError,
  safeProcessingError,
  type MaterialRow,
} from '../../../lib/learning-materials/server';
import {
  MAX_LEARNING_MATERIAL_BYTES,
  LearningMaterialLanguageError,
  LearningMaterialValidationError,
  learningMaterialMessages,
  validateLearningMaterial,
} from '../../../lib/learning-materials/validation';

const MAX_MULTIPART_REQUEST_BYTES = MAX_LEARNING_MATERIAL_BYTES + 64 * 1024;

export async function GET(request: Request) {
  try {
    const authenticated = await authenticatedClient(request);
    if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

    const learningLanguageId = new URL(request.url).searchParams.get('learningLanguageId');
    if (!learningLanguageId) return Response.json({ materials: [] });

    const { data, error } = await authenticated.client
      .from('learning_materials')
      .select('id,file_name,status,created_at,failure_reason')
      .eq('learner_id', authenticated.user.id)
      .eq('learning_language_id', learningLanguageId)
      .in('status', ['processing', 'ready', 'failed'])
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
  let processingVersion: number | null = null;
  try {
    const validated = await validateLearningMaterial(fileValue);
    const { client, user } = authenticated;
    const { data: language, error: languageError } = await client
      .from('learning_languages')
      .select('id,language_tag')
      .eq('id', learningLanguageId)
      .eq('learner_id', user.id)
      .maybeSingle();
    if (languageError || !language) return Response.json({ error: safeProcessingError }, { status: 400 });
    const languageTag = (language as { language_tag: string }).language_tag;

    materialId = crypto.randomUUID();
    const storagePath = `${user.id}/${learningLanguageId}/${materialId}/${validated.fileName}`;
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
      .select('id,file_name,status,created_at,processing_version')
      .single();
    if (insertError || !insertedRow) throw insertError ?? new Error('Learning Material could not be registered.');
    processingVersion = (insertedRow as MaterialRow).processing_version ?? 1;

    const { error: uploadError } = await authenticated.client.storage
      .from('learning-materials')
      .upload(storagePath, new Blob([validated.rawBytes as unknown as ArrayBuffer], { type: 'text/plain' }), {
        contentType: 'text/plain',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const completed = await processLearningMaterial(authenticated.client, materialId, processingVersion, validated.sourceText, languageTag);
    return Response.json({ material: materialResponse(completed as MaterialRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof LearningMaterialValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const languageMismatch = error instanceof LearningMaterialLanguageError;
    if (materialId && processingVersion !== null) {
      try {
        await failLearningMaterial(authenticated.client, materialId, learningLanguageId, processingVersion, languageMismatch ? error.message : null);
      } catch {
        return Response.json({ error: safeProcessingError }, { status: 500 });
      }
    }
    if (languageMismatch) return Response.json({ error: error.message }, { status: 422 });
    return Response.json({ error: safeProcessingError }, { status: 500 });
  }
}
