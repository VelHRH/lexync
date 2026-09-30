import {
  authenticatedClient,
  failLearningMaterial,
  materialResponse,
  retryMaterialResponse,
  safeAuthError,
  safeProcessingError,
  safeRetryError,
  safeUnavailableError,
  type RetryMaterial,
} from '../../../../../lib/learning-materials/server';
import { decodeLearningMaterialSource, processLearningMaterial } from '../../../../../lib/learning-materials/process';

type RouteContext = { params: Promise<{ materialId: string }> };

function isRetryMaterial(value: unknown): value is RetryMaterial {
  if (!value || typeof value !== 'object') return false;
  const material = value as Record<string, unknown>;
  return typeof material.id === 'string'
    && typeof material.fileName === 'string'
    && (material.status === 'processing' || material.status === 'ready' || material.status === 'failed')
    && typeof material.createdAt === 'string'
    && typeof material.storagePath === 'string'
    && typeof material.processingVersion === 'number'
    && typeof material.learningLanguageId === 'string';
}

export async function POST(request: Request, context: RouteContext) {
  const { materialId } = await context.params;
  let authenticated: Awaited<ReturnType<typeof authenticatedClient>> = null;
  try {
    authenticated = await authenticatedClient(request);
  } catch {
    return Response.json({ error: safeProcessingError }, { status: 500 });
  }
  if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: safeProcessingError }, { status: 400 });
  }
  const learningLanguageId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).learningLanguageId === 'string'
    ? (body as Record<string, string>).learningLanguageId
    : null;
  if (!learningLanguageId) return Response.json({ error: safeProcessingError }, { status: 400 });

  const { data, error } = await authenticated.client.rpc('claim_learning_material_retry', {
    p_material_id: materialId,
    p_learning_language_id: learningLanguageId,
  });
  if (error || !data || typeof data !== 'object') {
    return Response.json({ error: safeUnavailableError }, { status: 409 });
  }

  const claim = data as { material?: unknown; claimed?: unknown };
  if (typeof claim.claimed !== 'boolean' || !isRetryMaterial(claim.material)) {
    return Response.json({ error: safeUnavailableError }, { status: 409 });
  }
  const material = claim.material;
  if (!claim.claimed) {
    return Response.json({ material: materialResponse(retryMaterialResponse(material)) });
  }

  try {
    const { data: source, error: sourceError } = await authenticated.client.storage
      .from('learning-materials')
      .download(material.storagePath);
    if (sourceError || !source) throw sourceError ?? new Error('Learning Material source is unavailable.');

    const sourceText = await decodeLearningMaterialSource(source);
    const completed = await processLearningMaterial(
      authenticated.client,
      material.id,
      material.processingVersion,
      sourceText,
    );
    return Response.json({ material: materialResponse(completed as Parameters<typeof materialResponse>[0]) });
  } catch {
    try {
      await failLearningMaterial(
        authenticated.client,
        material.id,
        learningLanguageId,
        material.processingVersion,
      );
    } catch {
      return Response.json({ error: safeUnavailableError }, { status: 409 });
    }
    return Response.json({ error: safeRetryError }, { status: 500 });
  }
}
