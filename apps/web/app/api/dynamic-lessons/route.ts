import { canonicalLanguageTag, preferredAnswerLanguage, type TranslationLanguageUsage } from '@lexync/domain';
import { createGenerationProvider, GenerationProviderError } from '../../../lib/dynamic-lessons/generation';
import {
  insufficientMaterialMessage,
  MAX_PRACTICE_REQUEST_LENGTH,
  safeAnswerLanguageError,
  safeAuthError,
  safeGenerationBusyError,
  safeGenerationError,
  safeGenerationMaterialError,
  safeGenerationRetryError,
  safeRequestError,
} from '../../../lib/dynamic-lessons/server';
import { DynamicLessonGenerationError, validateDynamicLessonQuestions } from '../../../lib/dynamic-lessons/validation';
import { createEmbeddingProvider } from '../../../lib/learning-materials/embeddings';
import { authenticatedClient } from '../../../lib/learning-materials/server';

type AcceptedPassage = {
  id: string;
  material_id: string;
  ordinal: number;
  text: string;
  similarity: number;
};

type RetrievalResult = {
  min_questions: number;
  max_questions: number;
  sufficient: boolean;
  passages: AcceptedPassage[];
};

type TranslationUsageRow = {
  sense_id: string;
  answer_language_tag: string | null;
  last_used_at: string | null;
};

const POST_GENERATION_STEPS = new Set(['generation provider', 'Lesson Question generation', 'Lesson Question validation', 'Lesson Question assembly', 'create_dynamic_lesson']);
const RETRYABLE_SERVER_STEPS = new Set(['embedding provider', 'practice request embedding', 'retrieve_dynamic_lesson_context']);

function generationFailed(step: string, cause: unknown, status = 500, retryable = false) {
  console.error(`dynamic-lesson creation failed at ${step}`, cause instanceof Error ? { message: cause.message, cause: cause.cause, stack: cause.stack } : cause);
  const body: Record<string, unknown> = { error: safeGenerationError };
  if (retryable) body.retryable = true;
  return Response.json(body, { status });
}

function generationProviderFailed(step: string, error: unknown) {
  console.error(`dynamic-lesson creation failed at ${step}`, error instanceof Error ? { message: error.message, cause: error.cause, stack: error.stack } : error);
  if (error instanceof GenerationProviderError) {
    if (error.kind === 'quota') return Response.json({ error: safeGenerationBusyError, retryable: true }, { status: 429 });
    if (error.kind === 'invalid_output') return Response.json({ error: safeGenerationMaterialError, retryable: true }, { status: 502 });
    return Response.json({ error: safeGenerationRetryError, retryable: true }, { status: 503 });
  }
  if (error instanceof DynamicLessonGenerationError) return Response.json({ error: safeGenerationMaterialError, retryable: true }, { status: 502 });
  return Response.json({ error: safeGenerationRetryError, retryable: true }, { status: 500 });
}

export async function POST(request: Request) {
  let authenticated: Awaited<ReturnType<typeof authenticatedClient>> = null;
  try {
    authenticated = await authenticatedClient(request);
  } catch (error) {
    return generationFailed('authentication', error, 500, true);
  }
  if (!authenticated) return Response.json({ error: safeAuthError }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return generationFailed('request body', error, 400);
  }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const learningLanguageId = typeof payload.learningLanguageId === 'string' ? payload.learningLanguageId : null;
  const practiceRequest = typeof payload.practiceRequest === 'string' ? payload.practiceRequest.trim() : '';
  const requestedAnswerLanguageTag = typeof payload.answerLanguageTag === 'string' ? payload.answerLanguageTag : null;

  if (!learningLanguageId) return generationFailed('request body', 'learningLanguageId is missing', 400);
  if (!practiceRequest || practiceRequest.length > MAX_PRACTICE_REQUEST_LENGTH) {
    return Response.json({ error: safeRequestError }, { status: 400 });
  }

  const { client, user } = authenticated;
  let step = 'Learning Language lookup';

  try {
    const { data: learningLanguage, error: learningLanguageError } = await client
      .from('learning_languages')
      .select('id,language_tag')
      .eq('id', learningLanguageId)
      .eq('learner_id', user.id)
      .maybeSingle();
    if (learningLanguageError) return generationFailed(step, learningLanguageError, 500, true);
    if (!learningLanguage) return generationFailed(step, 'the Learning Language was not found', 400);
    const learningLanguageTag = (learningLanguage as { language_tag: string }).language_tag;

    let answerLanguageTag: string | null = null;
    if (requestedAnswerLanguageTag) {
      answerLanguageTag = canonicalLanguageTag(requestedAnswerLanguageTag);
      if (!answerLanguageTag) return Response.json({ error: safeAnswerLanguageError }, { status: 400 });
    } else {
      step = 'answer language inference';
      const { data: entryRows, error: entryError } = await client
        .from('vocabulary_entries')
        .select('id')
        .eq('learning_language_id', learningLanguageId);
      if (entryError) throw entryError;
      const entryIds = (entryRows ?? []).map((row) => (row as { id: string }).id);
      let usages: TranslationLanguageUsage[] = [];
      if (entryIds.length > 0) {
        const { data: senseRows, error: senseError } = await client
          .from('senses')
          .select('id,vocabulary_entry_id')
          .in('vocabulary_entry_id', entryIds);
        if (senseError) throw senseError;
        const senseIds = (senseRows ?? []).map((row) => (row as { id: string }).id);
        if (senseIds.length > 0) {
          const { data: translationRows, error: translationError } = await client
            .from('translations')
            .select('sense_id,answer_language_tag,last_used_at')
            .in('sense_id', senseIds);
          if (translationError) throw translationError;
          usages = (translationRows as unknown as TranslationUsageRow[])
            .filter((row) => Boolean(row.answer_language_tag?.trim()) && Boolean(row.last_used_at))
            .map((row) => ({
              answerLanguageTag: row.answer_language_tag as string,
              lastUsedAt: row.last_used_at as string,
              learningLanguageTag,
              senseId: row.sense_id,
            }));
        }
      }
      answerLanguageTag = preferredAnswerLanguage(usages, learningLanguageTag);
    }

    if (!answerLanguageTag) {
      return Response.json({ error: safeAnswerLanguageError, answerLanguageRequired: true }, { status: 409 });
    }

    step = 'embedding provider';
    const embeddingProvider = createEmbeddingProvider();
    step = 'practice request embedding';
    const queryEmbedding = await embeddingProvider.embedQuery(practiceRequest);

    step = 'retrieve_dynamic_lesson_context';
    const { data: retrieval, error: retrievalError } = await client.rpc('retrieve_dynamic_lesson_context', {
      p_learning_language_id: learningLanguageId,
      p_query_embedding: queryEmbedding,
      p_embedding_model: embeddingProvider.model,
    });
    if (retrievalError || !retrieval) throw retrievalError ?? new Error('Retrieval context is unavailable.');
    const retrievalResult = retrieval as RetrievalResult;

    if (!retrievalResult.sufficient) {
      return Response.json({ insufficientMaterial: true, error: insufficientMaterialMessage });
    }

    step = 'generation provider';
    const generationProvider = createGenerationProvider();
    step = 'Lesson Question generation';
    const candidates = await generationProvider.generateLessonQuestions({
      practiceRequest,
      learningLanguageTag,
      answerLanguageTag,
      minQuestions: retrievalResult.min_questions,
      maxQuestions: retrievalResult.max_questions,
      passages: retrievalResult.passages.map((passage) => ({ id: passage.id, text: passage.text })),
    });

    step = 'Lesson Question validation';
    const validatedQuestions = validateDynamicLessonQuestions(candidates, {
      minQuestions: retrievalResult.min_questions,
      maxQuestions: retrievalResult.max_questions,
      learningLanguageTag,
      answerLanguageTag,
      passages: retrievalResult.passages.map((passage) => ({ id: passage.id })),
    });

    step = 'Lesson Question assembly';
    const passagesById = new Map(retrievalResult.passages.map((passage) => [passage.id, passage]));
    const questionsPayload = validatedQuestions.map((question) => ({
      question_type: question.questionType,
      direction: question.direction,
      answer_language_tag: question.answerLanguageTag,
      prompt: question.prompt,
      choices: question.choices,
      correct_answer: question.correctAnswer,
      passages: question.supportingPassageIds.map((passageId) => {
        const passage = passagesById.get(passageId);
        if (!passage) throw new DynamicLessonGenerationError(`a validated question cites passage ${passageId}, which was not retrieved`);
        return {
          passage_id: passage.id,
          material_id: passage.material_id,
          passage_ordinal: passage.ordinal,
          similarity: passage.similarity,
          passage_text: passage.text,
        };
      }),
    }));

    step = 'create_dynamic_lesson';
    const { data: lesson, error: creationError } = await client.rpc('create_dynamic_lesson', {
      p_learning_language_id: learningLanguageId,
      p_questions: questionsPayload,
    });
    if (creationError || !lesson) throw creationError ?? new Error('Lesson could not be created.');
    const lessonPayload = lesson as { id: string; source: string; status: string };
    const lessonSummary = { id: lessonPayload.id, source: lessonPayload.source, status: lessonPayload.status };

    return Response.json({ lesson: lessonSummary });
  } catch (error) {
    if (POST_GENERATION_STEPS.has(step)) return generationProviderFailed(step, error);
    return generationFailed(step, error, 500, RETRYABLE_SERVER_STEPS.has(step));
  }
}
