import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export const safeProcessingError = 'Learning Material could not be prepared right now.';
export const safeAuthError = 'Please sign in to manage Learning Materials.';
export const safeUnavailableError = 'Learning Material is no longer available.';
export const safeDeleteError = 'Learning Material could not be deleted right now. Please try again.';
export const safeRetryError = 'Learning Material could not be prepared. Please try again.';

export type MaterialStatus = 'processing' | 'ready' | 'failed';

export type MaterialRow = {
  id: string;
  file_name: string;
  status: MaterialStatus;
  created_at: string;
  storage_path?: string;
  processing_version?: number;
  learning_language_id?: string;
};

export type RetryMaterial = {
  id: string;
  fileName: string;
  status: MaterialStatus;
  createdAt: string;
  storagePath: string;
  processingVersion: number;
  learningLanguageId: string;
};

export type AuthenticatedRequest = {
  client: SupabaseClient;
  user: User;
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

export async function authenticatedClient(request: Request): Promise<AuthenticatedRequest | null> {
  const client = supabaseForRequest(request);
  if (!client) return null;
  const authorization = request.headers.get('authorization') ?? '';
  const { data, error } = await client.auth.getUser(authorization.slice(7).trim());
  if (error || !data.user) return null;
  return { client, user: data.user };
}

export function materialResponse(row: MaterialRow) {
  return {
    id: row.id,
    fileName: row.file_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function retryMaterialResponse(material: RetryMaterial): MaterialRow {
  return {
    id: material.id,
    file_name: material.fileName,
    status: material.status,
    created_at: material.createdAt,
    storage_path: material.storagePath,
    processing_version: material.processingVersion,
    learning_language_id: material.learningLanguageId,
  };
}

export async function failLearningMaterial(
  client: SupabaseClient,
  materialId: string,
  learningLanguageId: string,
  processingVersion: number,
) {
  const { error } = await client.rpc('fail_learning_material', {
    p_material_id: materialId,
    p_learning_language_id: learningLanguageId,
    p_processing_version: processingVersion,
  });
  if (error) throw error;
}
