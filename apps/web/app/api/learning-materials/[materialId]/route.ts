import {
  authenticatedClient,
  safeAuthError,
  safeProcessingError,
  safeUnavailableError,
} from '../../../../lib/learning-materials/server';

type RouteContext = { params: Promise<{ materialId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
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

  const { data: material, error: materialError } = await authenticated.client
    .from('learning_materials')
    .select('id,storage_path')
    .eq('id', materialId)
    .eq('learner_id', authenticated.user.id)
    .eq('learning_language_id', learningLanguageId)
    .maybeSingle();
  if (materialError || !material) return Response.json({ error: safeUnavailableError }, { status: 404 });

  const { error: storageError } = await authenticated.client.storage
    .from('learning-materials')
    .remove([material.storage_path as string]);
  if (storageError) return Response.json({ error: safeProcessingError }, { status: 500 });

  const { data: deletedMaterial, error: deleteError } = await authenticated.client.rpc('delete_learning_material', {
    p_material_id: materialId,
    p_learning_language_id: learningLanguageId,
  });
  if (deleteError || !deletedMaterial) return Response.json({ error: safeProcessingError }, { status: 500 });

  return Response.json({ deleted: true });
}
