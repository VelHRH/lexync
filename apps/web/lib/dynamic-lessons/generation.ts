import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { buildClozePrompt } from '@lexync/domain';

export const GEMINI_GENERATION_MODEL = 'gemini-2.5-flash';

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
  return [
    `Learning Language: ${request.learningLanguageTag}`,
    `Answer Language: ${request.answerLanguageTag}`,
    `Practice Request: ${request.practiceRequest}`,
    `Produce between ${request.minQuestions} and ${request.maxQuestions} distinct Lesson Questions of type "translation" or "cloze", grounded only in the supplied passages below. Do not use any outside knowledge. Every question must cite the supporting passage ids it was drawn from in supportingPassageIds.`,
    passagesBlock,
  ].join('\n\n');
}

export class GeminiGenerationProvider implements GenerationProvider {
  readonly model = GEMINI_GENERATION_MODEL;
  private readonly chatModel: ChatGoogleGenerativeAI;

  constructor(apiKey: string) {
    this.chatModel = new ChatGoogleGenerativeAI({ apiKey, model: GEMINI_GENERATION_MODEL, temperature: 0, maxRetries: 2 });
  }

  async generateLessonQuestions(request: DynamicLessonGenerationRequest): Promise<DynamicLessonQuestionCandidate[]> {
    try {
      const structured = this.chatModel.withStructuredOutput(RESPONSE_JSON_SCHEMA, { name: 'dynamic_lesson_questions' });
      const result = await structured.invoke(buildGenerationPrompt(request)) as { questions: DynamicLessonQuestionCandidate[] };
      return result.questions;
    } catch {
      throw new Error('The Lesson generation provider could not produce Lesson Questions.');
    }
  }
}

export function createGenerationProvider(): GenerationProvider {
  const provider = process.env.LEXYNC_GENERATION_PROVIDER;
  if (provider === 'deterministic') return new DeterministicGenerationProvider();
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for the Gemini generation provider.');
    return new GeminiGenerationProvider(apiKey);
  }
  throw new Error('LEXYNC_GENERATION_PROVIDER must be explicitly set to deterministic or gemini.');
}
