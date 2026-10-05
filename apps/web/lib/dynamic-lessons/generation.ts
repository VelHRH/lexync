import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { buildClozePrompt, languageName } from '@lexync/domain';
import { readFileSync, rmSync } from 'node:fs';

export const GEMINI_GENERATION_MODEL = 'gemini-3.5-flash-lite';

export type DynamicLessonQuestionCandidate = {
  questionType: 'translation' | 'cloze';
  direction: 'recognition' | 'recall' | null;
  answerLanguageTag: string | null;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  supportingPassageIds: string[];
};

export type DynamicLessonGenerationRequest = {
  practiceRequest: string;
  learningLanguageTag: string;
  answerLanguageTag: string;
  minQuestions: number;
  maxQuestions: number;
  passages: readonly { id: string; text: string }[];
};

export type GenerationProvider = {
  readonly model: string;
  generateLessonQuestions(request: DynamicLessonGenerationRequest): Promise<DynamicLessonQuestionCandidate[]>;
};

export type GenerationFailureKind = 'timeout' | 'quota' | 'transport' | 'provider' | 'invalid_output';

export class GenerationProviderError extends Error {
  readonly kind: GenerationFailureKind;

  constructor(kind: GenerationFailureKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.kind = kind;
  }
}

function matchFailureSignals(error: unknown): GenerationFailureKind | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  const name = typeof err.name === 'string' ? err.name : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const code = typeof err.code === 'string' ? err.code : '';
  const status = typeof err.status === 'number' ? err.status : (typeof err.statusCode === 'number' ? err.statusCode : null);

  if (name === 'AbortError' || name === 'TimeoutError' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || status === 504 || /timed?\s?out|deadline exceeded/i.test(message)) return 'timeout';
  if (status === 429 || /quota|rate ?limit|resource[_ ]exhausted|too many requests/i.test(message)) return 'quota';
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(code) || /fetch failed|socket hang up|network|unavailable|connection/i.test(message) || (typeof status === 'number' && status >= 500)) return 'transport';
  return null;
}

export function classifyGenerationFailure(error: unknown): GenerationFailureKind {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof GenerationProviderError) return current.kind;
    const matched = matchFailureSignals(current);
    if (matched) return matched;
    current = current instanceof Error ? current.cause : undefined;
  }
  return 'provider';
}

type TokenCandidate = {
  token: string;
  passageId: string;
};

const TOKEN_MIN_LENGTH = 3;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

function collectTokenCandidates(passages: readonly { id: string; text: string }[]): TokenCandidate[] {
  const seen = new Set<string>();
  const candidates: TokenCandidate[] = [];
  for (const passage of passages) {
    const words = passage.text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= TOKEN_MIN_LENGTH);
    for (const word of words) {
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ token: word, passageId: passage.id });
    }
  }
  return candidates;
}

function findClozeSentence(token: string, passage: { id: string; text: string } | undefined): string | null {
  if (!passage) return null;
  for (const sentence of splitSentences(passage.text)) {
    if (buildClozePrompt(sentence, token)) return sentence;
  }
  return null;
}

function pickDistractors(tokens: TokenCandidate[], correctIndex: number): [string, string] {
  if (tokens.length < 3) throw new Error('Learning Materials do not contain enough distinct vocabulary to build a Lesson.');
  const first = tokens[(correctIndex + 1) % tokens.length].token;
  const second = tokens[(correctIndex + 2) % tokens.length].token;
  return [first, second];
}

export class DeterministicGenerationProvider implements GenerationProvider {
  readonly model = 'lexync-deterministic-generation-v1';

  async generateLessonQuestions(request: DynamicLessonGenerationRequest): Promise<DynamicLessonQuestionCandidate[]> {
    const tokens = collectTokenCandidates(request.passages);
    const passagesById = new Map(request.passages.map((passage) => [passage.id, passage]));
    const usedTokenKeys = new Set<string>();
    const usedPrompts = new Set<string>();
    const questions: DynamicLessonQuestionCandidate[] = [];
    let translationCount = 0;

    for (let ordinal = 0; ordinal < request.minQuestions; ordinal += 1) {
      const wantsCloze = ordinal % 2 === 0;
      let placed = false;

      for (let index = 0; index < tokens.length && !placed; index += 1) {
        const candidate = tokens[index];
        const tokenKey = candidate.token.toLowerCase();
        if (usedTokenKeys.has(tokenKey)) continue;

        if (wantsCloze) {
          const sentence = findClozeSentence(candidate.token, passagesById.get(candidate.passageId));
          if (!sentence) continue;
          const prompt = buildClozePrompt(sentence, candidate.token);
          if (!prompt || usedPrompts.has(prompt)) continue;
          const [firstDistractor, secondDistractor] = pickDistractors(tokens, index);
          usedTokenKeys.add(tokenKey);
          usedPrompts.add(prompt);
          questions.push({
            questionType: 'cloze',
            direction: null,
            answerLanguageTag: null,
            prompt,
            choices: [candidate.token, firstDistractor, secondDistractor],
            correctAnswer: candidate.token,
            supportingPassageIds: [candidate.passageId],
          });
          placed = true;
        } else {
          const prompt = `Translate "${candidate.token}".`;
          if (usedPrompts.has(prompt)) continue;
          const [firstDistractor, secondDistractor] = pickDistractors(tokens, index);
          usedTokenKeys.add(tokenKey);
          usedPrompts.add(prompt);
          questions.push({
            questionType: 'translation',
            direction: translationCount % 2 === 0 ? 'recognition' : 'recall',
            answerLanguageTag: request.answerLanguageTag,
            prompt,
            choices: [candidate.token, firstDistractor, secondDistractor],
            correctAnswer: candidate.token,
            supportingPassageIds: [candidate.passageId],
          });
          translationCount += 1;
          placed = true;
        }
      }

      if (!placed) throw new Error('Learning Materials do not contain enough distinct material to build a Lesson.');
    }

    return questions;
  }
}

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionType: { type: 'string', format: 'enum', enum: ['translation', 'cloze'] },
          direction: { type: 'string', format: 'enum', enum: ['recognition', 'recall'], nullable: true },
          answerLanguageTag: { type: 'string', nullable: true },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
          correctAnswer: { type: 'string' },
          supportingPassageIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['questionType', 'direction', 'answerLanguageTag', 'prompt', 'choices', 'correctAnswer', 'supportingPassageIds'],
      },
    },
  },
  required: ['questions'],
} as const;

function buildGenerationPrompt(request: DynamicLessonGenerationRequest): string {
  const passagesBlock = request.passages
    .map((passage) => `Passage ${passage.id}:\n${passage.text}`)
    .join('\n\n');
  const learningLanguage = `${languageName(request.learningLanguageTag)} (${request.learningLanguageTag})`;
  const answerLanguage = `${languageName(request.answerLanguageTag)} (${request.answerLanguageTag})`;
  return [
    `Learning Language: ${learningLanguage}`,
    `Answer Language: ${answerLanguage}`,
    `Practice Request: ${request.practiceRequest}`,
    `Produce between ${request.minQuestions} and ${request.maxQuestions} distinct Lesson Questions of type "translation" or "cloze", grounded only in the supplied passages below. Do not use any outside knowledge.`,
    [
      'Rules every question must satisfy:',
      '- It practises what the Practice Request asks for. Ignore anything in the passages that falls outside that request, however well attested it is.',
      `- A "recognition" question writes prompt in ${learningLanguage} and every choice in ${answerLanguage}.`,
      `- A "recall" question writes prompt in ${answerLanguage} and every choice in ${learningLanguage}.`,
      `- A "cloze" question writes prompt and every choice in ${learningLanguage}.`,
      `- questionType is exactly "translation" or "cloze".`,
      `- A "translation" question sets direction to "recognition" or "recall" and answerLanguageTag to exactly "${request.answerLanguageTag}".`,
      '- A "cloze" question sets direction to null and answerLanguageTag to null.',
      '- choices holds between 2 and 4 non-empty, distinct options.',
      '- correctAnswer repeats exactly one entry of choices, character for character.',
      '- prompt is unique across the questions you return.',
      '- supportingPassageIds is non-empty and holds only labels of the passages below, such as P1, copied exactly.',
    ].join('\n'),
    passagesBlock,
  ].join('\n\n');
}

export class GeminiGenerationProvider implements GenerationProvider {
  readonly model = GEMINI_GENERATION_MODEL;
  private readonly chatModel: ChatGoogleGenerativeAI;

  constructor(apiKey: string) {
    this.chatModel = new ChatGoogleGenerativeAI({ apiKey, model: GEMINI_GENERATION_MODEL, maxRetries: 2 });
  }

  async generateLessonQuestions(request: DynamicLessonGenerationRequest): Promise<DynamicLessonQuestionCandidate[]> {
    const passageIdByLabel = new Map<string, string>();
    const labelledPassages = request.passages.map((passage, index) => {
      const label = `P${index + 1}`;
      passageIdByLabel.set(label, passage.id);
      return { id: label, text: passage.text };
    });
    try {
      const structured = this.chatModel.withStructuredOutput(RESPONSE_JSON_SCHEMA, { name: 'dynamic_lesson_questions' });
      const result = await structured.invoke(buildGenerationPrompt({ ...request, passages: labelledPassages })) as { questions?: DynamicLessonQuestionCandidate[] };
      if (!Array.isArray(result?.questions)) return result?.questions as unknown as DynamicLessonQuestionCandidate[];
      return result.questions.map((question) => ({
        ...question,
        supportingPassageIds: Array.isArray(question?.supportingPassageIds)
          ? question.supportingPassageIds.map((label) => passageIdByLabel.get(String(label).trim().toUpperCase()) ?? label)
          : question?.supportingPassageIds,
      }));
    } catch (error) {
      throw new GenerationProviderError(classifyGenerationFailure(error), 'The Lesson generation provider could not produce Lesson Questions.', { cause: error });
    }
  }
}

export type GenerationFault = {
  kind?: GenerationFailureKind;
  invalid?: 'duplicate-prompts' | 'too-few-questions' | 'empty-choices' | 'no-correct-answer' | 'unknown-passage';
};

function applyInvalidFault(candidates: DynamicLessonQuestionCandidate[], invalid: NonNullable<GenerationFault['invalid']>): DynamicLessonQuestionCandidate[] {
  const copies = candidates.map((candidate) => ({ ...candidate }));
  switch (invalid) {
    case 'duplicate-prompts':
      if (copies.length >= 2) copies[1] = { ...copies[1], prompt: copies[0].prompt };
      return copies;
    case 'too-few-questions':
      return copies.slice(0, 1);
    case 'empty-choices':
      if (copies.length >= 1) copies[0] = { ...copies[0], choices: [] };
      return copies;
    case 'no-correct-answer':
      if (copies.length >= 1) copies[0] = { ...copies[0], correctAnswer: '—' };
      return copies;
    case 'unknown-passage':
      if (copies.length >= 1) copies[0] = { ...copies[0], supportingPassageIds: ['00000000-0000-0000-0000-000000000000'] };
      return copies;
  }
}

export class FaultInjectingGenerationProvider implements GenerationProvider {
  private readonly inner: GenerationProvider;
  private readonly faultFilePath: string;

  constructor(inner: GenerationProvider, faultFilePath: string) {
    this.inner = inner;
    this.faultFilePath = faultFilePath;
  }

  get model(): string {
    return this.inner.model;
  }

  async generateLessonQuestions(request: DynamicLessonGenerationRequest): Promise<DynamicLessonQuestionCandidate[]> {
    const fault = this.readFault();
    if (!fault) return this.inner.generateLessonQuestions(request);
    if (fault.kind) throw new GenerationProviderError(fault.kind, 'The Lesson generation provider could not produce Lesson Questions.');
    if (fault.invalid) {
      const candidates = await this.inner.generateLessonQuestions(request);
      return applyInvalidFault(candidates, fault.invalid);
    }
    return this.inner.generateLessonQuestions(request);
  }

  private readFault(): GenerationFault | null {
    let parsed: GenerationFault;
    try {
      const contents = readFileSync(this.faultFilePath, 'utf8');
      parsed = JSON.parse(contents) as GenerationFault;
    } catch {
      return null;
    }
    try {
      rmSync(this.faultFilePath, { force: true });
    } catch {
    }
    return parsed;
  }
}

export function createGenerationProvider(): GenerationProvider {
  const provider = process.env.LEXYNC_GENERATION_PROVIDER;
  if (provider === 'deterministic') {
    const base = new DeterministicGenerationProvider();
    const faultFilePath = process.env.LEXYNC_GENERATION_FAULT_FILE;
    if (faultFilePath) return new FaultInjectingGenerationProvider(base, faultFilePath);
    return base;
  }
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for the Gemini generation provider.');
    return new GeminiGenerationProvider(apiKey);
  }
  throw new Error('LEXYNC_GENERATION_PROVIDER must be explicitly set to deterministic or gemini.');
}
