import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  DeterministicGenerationProvider,
  FaultInjectingGenerationProvider,
  GEMINI_GENERATION_MODEL,
  GenerationProviderError,
} from '../../apps/web/lib/dynamic-lessons/generation';
import {
  insufficientMaterialMessage,
  safeAnswerLanguageError,
  safeAuthError,
  safeGenerationBusyError,
  safeGenerationError,
  safeGenerationMaterialError,
  safeGenerationRetryError,
  safeRequestError,
} from '../../apps/web/lib/dynamic-lessons/server';
import { DynamicLessonGenerationError } from '../../apps/web/lib/dynamic-lessons/validation';
import { DeterministicEmbeddingProvider, GEMINI_EMBEDDING_MODEL } from '../../apps/web/lib/learning-materials/embeddings';
import { normalizeLearningMaterialText, PASSAGE_SCHEMA_VERSION, splitLearningMaterial } from '../../apps/web/lib/learning-materials/processing';
import { armGenerationFault, clearGenerationFault } from '../support/generation-faults';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

const PASSAGE_SENTINEL = 'qvarnholt';
const STUDY_PARAGRAPH_ONE = 'The water cycle explains how the planet reuses its water again and again. Warm sunlight heats the ocean and causes evaporation, which lifts tiny water molecules into the atmosphere as vapor. As the vapor rises, a drop in temperature leads to condensation, and the vapor turns back into liquid drops that form clouds. Once those drops grow heavy, precipitation falls back to earth as rain or snow, feeding rivers, lakes, and groundwater below the surface. This simple loop repeats every day across the whole planet.';
const STUDY_PARAGRAPH_TWO = 'Once precipitation reaches the ground, part of it sinks down to become groundwater while the rest runs off into streams. Plants pull up that groundwater through their roots and send water molecules back into the atmosphere through transpiration, joining the vapor already rising from evaporation nearby. The balance between evaporation, condensation, and precipitation depends on sunlight, wind, and local temperature each day.';
const SENTINEL_PARAGRAPH = `The private field notebook calls this phenomenon ${PASSAGE_SENTINEL} retention, and every observer in the study referred to the ${PASSAGE_SENTINEL} pattern when comparing basins. Local guides warned that a ${PASSAGE_SENTINEL} shift could change the whole valley.`;
const RELEVANT_FIXTURE_CONTENT = `${STUDY_PARAGRAPH_ONE}\n\n${STUDY_PARAGRAPH_TWO}\n\n${SENTINEL_PARAGRAPH}\n`;
const RELEVANT_PRACTICE_REQUEST = 'I want to work on evaporation, condensation, precipitation, groundwater, atmosphere, and temperature.';
const IRRELEVANT_PRACTICE_REQUEST = 'Can you help me practise ordering food at a restaurant in French?';

const SAFE_DYNAMIC_LESSON_MESSAGES = [
  safeAuthError,
  safeGenerationError,
  safeRequestError,
  safeAnswerLanguageError,
  insufficientMaterialMessage,
  safeGenerationRetryError,
  safeGenerationBusyError,
  safeGenerationMaterialError,
];

const forbiddenContent: string[] = [];
if (process.env.SUPABASE_SERVICE_ROLE_KEY) forbiddenContent.push(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (process.env.GEMINI_API_KEY) forbiddenContent.push(process.env.GEMINI_API_KEY);
forbiddenContent.push(
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'sb_secret_',
  'service_role',
  'Gemini',
  'gemini',
  GEMINI_GENERATION_MODEL,
  GEMINI_EMBEDDING_MODEL,
  'langchain',
  GenerationProviderError.name,
  DynamicLessonGenerationError.name,
  FaultInjectingGenerationProvider.name,
  new DeterministicGenerationProvider().model,
  'stack',
  'at Object.',
  'node_modules',
  PASSAGE_SENTINEL,
);

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerWithLanguage(prefix: string, languageTag = 'es') {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session || !data.user) throw error ?? new Error('The local learner session is missing.');
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: languageTag });
  if (languageError) throw languageError;
  return {
    account,
    accessToken: data.session.access_token,
    client,
    learningLanguageId: (language as { id: string }).id,
    userId: data.user.id,
  };
}

async function captureEntry(client: SupabaseClient, learningLanguageId: string, expression: string, translation: string) {
  const { error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
}

async function seedPreferredAnswerLanguage(client: SupabaseClient, learningLanguageId: string) {
  await captureEntry(client, learningLanguageId, 'perro', 'dog');
}

async function seedReadyMaterial(client: SupabaseClient, userId: string, learningLanguageId: string, fileName: string, sourceText: string) {
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${learningLanguageId}/${id}/${fileName}`;
  const content = Buffer.from(sourceText, 'utf8');
  const { error: insertError } = await client.from('learning_materials').insert({
    id,
    learner_id: userId,
    learning_language_id: learningLanguageId,
    file_name: fileName,
    storage_path: storagePath,
    byte_size: content.byteLength,
    status: 'processing',
  });
  if (insertError) throw insertError;
  const { error: uploadError } = await client.storage.from('learning-materials').upload(storagePath, content, { contentType: 'text/plain' });
  if (uploadError) throw uploadError;

  const normalizedText = normalizeLearningMaterialText(sourceText);
  const passages = await splitLearningMaterial(normalizedText);
  const provider = new DeterministicEmbeddingProvider();
  const embeddings = await provider.embedDocuments(passages.map((passage) => passage.text));
  const { error: completionError } = await client.rpc('complete_learning_material', {
    p_embedding_dimension: provider.dimension,
    p_embedding_model: provider.model,
    p_material_id: id,
    p_normalized_text: normalizedText,
    p_passage_schema_version: PASSAGE_SCHEMA_VERSION,
    p_passages: passages.map((passage, index) => ({
      embedding: embeddings[index],
      embedding_model: provider.model,
      ordinal: passage.ordinal,
      passage_text: passage.text,
      source_end: passage.endOffset,
      source_start: passage.startOffset,
    })),
    p_processing_version: 1,
  });
  if (completionError) throw completionError;

  return { id };
}

async function retrievedPassageIds(client: SupabaseClient, learningLanguageId: string, practiceRequest: string) {
  const provider = new DeterministicEmbeddingProvider();
  const queryEmbedding = await provider.embedQuery(practiceRequest);
  const { data: retrieval, error } = await client.rpc('retrieve_dynamic_lesson_context', {
    p_embedding_model: provider.model,
    p_learning_language_id: learningLanguageId,
    p_query_embedding: queryEmbedding,
  });
  if (error || !retrieval) throw error ?? new Error('Retrieval context is unavailable.');
  const passages = (retrieval as { passages: { id: string }[] }).passages ?? [];
  return passages.map((passage) => passage.id);
}

function authorizationHeaders(accessToken: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
}

function postDynamicLesson(request: APIRequestContext, accessToken: string | null, body: unknown) {
  const headers = accessToken ? authorizationHeaders(accessToken) : {};
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return request.post('/api/dynamic-lessons', { data, headers });
}

async function assertResponseFree(response: Awaited<ReturnType<typeof postDynamicLesson>>) {
  const bodyText = (await response.text()).toLowerCase();
  for (const forbidden of forbiddenContent) {
    expect(bodyText).not.toContain(forbidden.toLowerCase());
  }
  const headers = response.headers();
  for (const value of Object.values(headers)) {
    const lowerValue = value.toLowerCase();
    for (const forbidden of forbiddenContent) {
      expect(lowerValue).not.toContain(forbidden.toLowerCase());
    }
  }
}

function assertSafeFailureBody(bodyJson: Record<string, unknown>) {
  const allowedKeys = ['error', 'retryable', 'answerLanguageRequired'];
  expect(Object.keys(bodyJson).every((key) => allowedKeys.includes(key))).toBe(true);
  expect(SAFE_DYNAMIC_LESSON_MESSAGES).toContain(bodyJson.error);
}

function assertNoPassageLeak(bodyText: string, passageIds: readonly string[]) {
  expect(bodyText).not.toContain(PASSAGE_SENTINEL);
  for (const passageId of passageIds) expect(bodyText).not.toContain(passageId);
}

test.describe('Dynamic Lesson API response security', () => {
  test.describe.configure({ mode: 'serial' });

  let learner: Awaited<ReturnType<typeof registerWithLanguage>>;
  let passageIds: string[];

  test.beforeAll(async () => {
    learner = await registerWithLanguage('api-response-security');
    await seedPreferredAnswerLanguage(learner.client, learner.learningLanguageId);
    await seedReadyMaterial(learner.client, learner.userId, learner.learningLanguageId, 'response-security-notes.txt', RELEVANT_FIXTURE_CONTENT);
    passageIds = await retrievedPassageIds(learner.client, learner.learningLanguageId, RELEVANT_PRACTICE_REQUEST);
  });

  test.beforeEach(() => {
    clearGenerationFault();
  });

  test.afterEach(() => {
    clearGenerationFault();
  });

  test('rejects an unauthenticated request without leaking credentials or internals', async ({ request }) => {
    const response = await postDynamicLesson(request, null, { learningLanguageId: crypto.randomUUID(), practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(401);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('rejects a malformed JSON body without leaking credentials or internals', async ({ request }) => {
    const anonymousLearner = await registerWithLanguage('api-response-security-malformed');
    const response = await postDynamicLesson(request, anonymousLearner.accessToken, '{not valid json');
    expect(response.status()).toBe(400);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('rejects a request missing learningLanguageId without leaking credentials or internals', async ({ request }) => {
    const anonymousLearner = await registerWithLanguage('api-response-security-missing-language');
    const response = await postDynamicLesson(request, anonymousLearner.accessToken, { practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(400);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('reports a provider failure without leaking credentials or internals', async ({ request }) => {
    armGenerationFault({ kind: 'provider' });
    const response = await postDynamicLesson(request, learner.accessToken, { learningLanguageId: learner.learningLanguageId, practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(503);
    const bodyText = await response.text();
    assertNoPassageLeak(bodyText, passageIds);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('reports a quota failure without leaking credentials or internals', async ({ request }) => {
    armGenerationFault({ kind: 'quota' });
    const response = await postDynamicLesson(request, learner.accessToken, { learningLanguageId: learner.learningLanguageId, practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(429);
    const bodyText = await response.text();
    assertNoPassageLeak(bodyText, passageIds);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('rejects invalid generated questions without leaking credentials or internals', async ({ request }) => {
    armGenerationFault({ invalid: 'duplicate-prompts' });
    const response = await postDynamicLesson(request, learner.accessToken, { learningLanguageId: learner.learningLanguageId, practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(502);
    const bodyText = await response.text();
    assertNoPassageLeak(bodyText, passageIds);
    await assertResponseFree(response);
    const bodyJson = await response.json();
    assertSafeFailureBody(bodyJson);
  });

  test('refuses an irrelevant Practice Request without leaking credentials, internals, or source text', async ({ request }) => {
    const response = await postDynamicLesson(request, learner.accessToken, { learningLanguageId: learner.learningLanguageId, practiceRequest: IRRELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(200);
    const bodyText = await response.text();
    assertNoPassageLeak(bodyText, passageIds);
    await assertResponseFree(response);
    const bodyJson = await response.json() as { insufficientMaterial?: boolean; error?: string };
    expect(bodyJson.insufficientMaterial).toBe(true);
    expect(bodyJson.error).toBe(insufficientMaterialMessage);
  });

  test('returns only the safe Lesson summary on success, with no provenance or passage detail', async ({ request }) => {
    const response = await postDynamicLesson(request, learner.accessToken, { learningLanguageId: learner.learningLanguageId, practiceRequest: RELEVANT_PRACTICE_REQUEST });
    expect(response.status()).toBe(200);
    const bodyText = await response.text();
    assertNoPassageLeak(bodyText, passageIds);
    await assertResponseFree(response);
    const bodyJson = await response.json() as { lesson?: Record<string, unknown> };
    expect(Object.keys(bodyJson)).toEqual(['lesson']);
    expect(bodyJson.lesson).toBeTruthy();
    expect(Object.keys(bodyJson.lesson as Record<string, unknown>).sort()).toEqual(['id', 'source', 'status']);
  });
});
