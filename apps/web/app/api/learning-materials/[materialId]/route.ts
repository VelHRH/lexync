import {
  authenticatedClient,
  safeAuthError,
  safeDeleteError,
  safeUnavailableError,
} from '../../../../lib/learning-materials/server';

type RouteContext = { params: Promise<{ materialId: string }> };

function deleteFailed(step: string, cause: unknown, status = 500) {
  console.error(`learning-material delete failed at ${step}`, cause);
  return Response.json({ error: safeDeleteError }, { status });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { materialId } = await context.params;
  let authenticated: Awaited<ReturnType<typeof authenticatedClient>> = null;
  try {
    authenticated = await authenticatedClient(request);
  } catch (error) {
    return deleteFailed('authentication', error);
  }
  if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return deleteFailed('request body', error, 400);
  }
  const learningLanguageId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).learningLanguageId === 'string'
    ? (body as Record<string, string>).learningLanguageId
    : null;
  if (!learningLanguageId) return deleteFailed('request body', 'learningLanguageId is missing', 400);

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

  const { data: deletedMaterial, error: deleteError } = await authenticated.client.rpc('delete_learning_material', {
    p_material_id: materialId,
    p_learning_language_id: learningLanguageId,
  });
  if (deleteError || !deletedMaterial) {
    if (storageError) return deleteFailed('storage removal', storageError);
    return deleteFailed('delete_learning_material', deleteError ?? 'the Learning Material row was not returned');
  }

  return Response.json({ deleted: true });
}
