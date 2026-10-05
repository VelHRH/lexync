import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  classifyGenerationFailure,
  DeterministicGenerationProvider,
  FaultInjectingGenerationProvider,
  GenerationProviderError,
  type DynamicLessonGenerationRequest,
} from '../../apps/web/lib/dynamic-lessons/generation';
import { DynamicLessonGenerationError, validateDynamicLessonQuestions } from '../../apps/web/lib/dynamic-lessons/validation';

function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

function withCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

function withName(message: string, name: string): Error {
  return Object.assign(new Error(message), { name });
}

test.describe('classifyGenerationFailure', () => {
  test.describe('timeout', () => {
    test('classifies an AbortError by name', () => {
      expect(classifyGenerationFailure(withName('aborted', 'AbortError'))).toBe('timeout');
    });

    test('classifies an ETIMEDOUT code', () => {
      expect(classifyGenerationFailure(withCode('connect failed', 'ETIMEDOUT'))).toBe('timeout');
    });

    test('classifies a message reporting the request timed out', () => {
      expect(classifyGenerationFailure(new Error('The request timed out after 30000ms.'))).toBe('timeout');
    });

    test('classifies a 504 status', () => {
      expect(classifyGenerationFailure(withStatus('gateway timeout', 504))).toBe('timeout');
    });
  });

  test.describe('quota', () => {
    test('classifies a 429 status', () => {
      expect(classifyGenerationFailure(withStatus('too many requests', 429))).toBe('quota');
    });

    test('classifies a message mentioning quota', () => {
      expect(classifyGenerationFailure(new Error('Quota exceeded for this project.'))).toBe('quota');
    });

    test('classifies a message mentioning a rate limit', () => {
      expect(classifyGenerationFailure(new Error('Rate limit exceeded, please slow down.'))).toBe('quota');
    });

    test('classifies a message reporting RESOURCE_EXHAUSTED', () => {
      expect(classifyGenerationFailure(new Error('RESOURCE_EXHAUSTED: too many tokens requested.'))).toBe('quota');
    });
  });

  test.describe('transport', () => {
    test('classifies an ECONNRESET code', () => {
      expect(classifyGenerationFailure(withCode('connection reset', 'ECONNRESET'))).toBe('transport');
    });

    test('classifies an ENOTFOUND code', () => {
      expect(classifyGenerationFailure(withCode('dns lookup failed', 'ENOTFOUND'))).toBe('transport');
    });

    test('classifies an EAI_AGAIN code', () => {
      expect(classifyGenerationFailure(withCode('dns temporary failure', 'EAI_AGAIN'))).toBe('transport');
    });

    test('classifies a fetch failed message', () => {
      expect(classifyGenerationFailure(new Error('fetch failed'))).toBe('transport');
    });

    test('classifies a socket hang up message', () => {
      expect(classifyGenerationFailure(new Error('socket hang up'))).toBe('transport');
    });

    test('classifies a 500 status', () => {
      expect(classifyGenerationFailure(withStatus('internal server error', 500))).toBe('transport');
    });
  });

  test.describe('provider', () => {
    test('falls back to provider for an unremarkable Error', () => {
      expect(classifyGenerationFailure(new Error('Something unexpected happened.'))).toBe('provider');
    });

    test('falls back to provider for a non-Error string value without throwing', () => {
      expect(() => classifyGenerationFailure('boom')).not.toThrow();
      expect(classifyGenerationFailure('boom')).toBe('provider');
    });

    test('falls back to provider for undefined without throwing', () => {
      expect(() => classifyGenerationFailure(undefined)).not.toThrow();
      expect(classifyGenerationFailure(undefined)).toBe('provider');
    });
  });

  test.describe('cause chain', () => {
    test('classifies a generic Error whose cause is a 429-shaped error as quota', () => {
      const cause = withStatus('rejected by upstream', 429);
      const outer = new Error('Lesson generation request failed.', { cause });
      expect(classifyGenerationFailure(outer)).toBe('quota');
    });

    test('resolves a two-level nested cause', () => {
      const innermost = withStatus('rejected by upstream', 429);
      const middle = new Error('wrapped once', { cause: innermost });
      const outer = new Error('wrapped twice', { cause: middle });
      expect(classifyGenerationFailure(outer)).toBe('quota');
    });

    test('does not hang on a self-referencing cyclic cause', () => {
      const cyclic = new Error('cyclic cause refers to itself');
      (cyclic as unknown as { cause: unknown }).cause = cyclic;

      let kind: string | undefined;
      expect(() => {
        kind = classifyGenerationFailure(cyclic);
      }).not.toThrow();
      expect(kind).toBe('provider');
    });
  });

  test.describe('precedence', () => {
    test('returns the kind carried by a GenerationProviderError unchanged, even if the message would otherwise match a different signal', () => {
      const error = new GenerationProviderError('invalid_output', 'This message mentions quota exceeded just to confuse pattern matching.');
      expect(classifyGenerationFailure(error)).toBe('invalid_output');
    });
  });
});

test.describe('GenerationProviderError', () => {
  test('carries the kind it was constructed with', () => {
    const error = new GenerationProviderError('timeout', 'The Lesson generation provider could not produce Lesson Questions.');
    expect(error.kind).toBe('timeout');
  });

  test('is an instance of Error', () => {
    const error = new GenerationProviderError('transport', 'boom');
    expect(error).toBeInstanceOf(Error);
  });

  test('preserves a supplied cause', () => {
    const cause = new Error('root cause');
    const error = new GenerationProviderError('provider', 'wrapped', { cause });
    expect(error.cause).toBe(cause);
  });
});

const REQUEST_PASSAGES = [
  { id: 'passage-1', text: 'Rivers carry fresh water across continents every single year. Mountains store deep snow during cold winters.' },
  { id: 'passage-2', text: 'Forests absorb carbon dioxide through countless green leaves. Deserts receive scarce rainfall across dry seasons.' },
] as const;

function buildRequest(): DynamicLessonGenerationRequest {
  return {
    practiceRequest: 'I want to practise vocabulary about rivers, forests, mountains, and deserts.',
    learningLanguageTag: 'en',
    answerLanguageTag: 'es',
    minQuestions: 4,
    maxQuestions: 6,
    passages: REQUEST_PASSAGES,
  };
}

function validationContext(request: DynamicLessonGenerationRequest) {
  return {
    minQuestions: request.minQuestions,
    maxQuestions: request.maxQuestions,
    learningLanguageTag: request.learningLanguageTag,
    answerLanguageTag: request.answerLanguageTag,
    passages: request.passages,
  };
}

test.describe('FaultInjectingGenerationProvider', () => {
  let tempDir: string;
  let faultFilePath: string;

  test.beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'lexync-generation-fault-'));
    faultFilePath = path.join(tempDir, 'fault.json');
  });

  test.afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('delegates to the inner provider when no fault file is present', async () => {
    const inner = new DeterministicGenerationProvider();
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const expected = await inner.generateLessonQuestions(request);
    const actual = await wrapper.generateLessonQuestions(request);

    expect(actual).toEqual(expected);
    expect(wrapper.model).toBe(inner.model);
  });

  test('throws a GenerationProviderError for an armed kind fault, without leaking request content or a cause', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ kind: 'quota' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    let thrown: unknown;
    try {
      await wrapper.generateLessonQuestions(request);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GenerationProviderError);
    const error = thrown as GenerationProviderError;
    expect(error.kind).toBe('quota');
    expect(error.message).not.toContain(request.practiceRequest);
    for (const passage of request.passages) expect(error.message).not.toContain(passage.text);
    expect(error.cause).toBeUndefined();
  });

  test('consumes the fault file: it is removed after the throwing call, and the next call succeeds normally', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ kind: 'transport' }), 'utf8');
    const inner = new DeterministicGenerationProvider();
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    await expect(wrapper.generateLessonQuestions(request)).rejects.toBeInstanceOf(GenerationProviderError);
    expect(existsSync(faultFilePath)).toBe(false);

    const expected = await inner.generateLessonQuestions(request);
    const actual = await wrapper.generateLessonQuestions(request);
    expect(actual).toEqual(expected);
  });

  test('duplicate-prompts fault returns a candidate set with two identical prompts, rejected by the validator', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ invalid: 'duplicate-prompts' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const candidates = await wrapper.generateLessonQuestions(request);

    expect(candidates[0].prompt).toBe(candidates[1].prompt);
    expect(new Set(candidates.map((candidate) => candidate.prompt)).size).toBeLessThan(candidates.length);
    expect(() => validateDynamicLessonQuestions(candidates, validationContext(request))).toThrow(DynamicLessonGenerationError);
  });

  test('too-few-questions fault returns fewer candidates than minQuestions, rejected by the validator', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ invalid: 'too-few-questions' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const candidates = await wrapper.generateLessonQuestions(request);

    expect(candidates.length).toBeLessThan(request.minQuestions);
    expect(() => validateDynamicLessonQuestions(candidates, validationContext(request))).toThrow(DynamicLessonGenerationError);
  });

  test('empty-choices fault returns a candidate with an empty choices array, rejected by the validator', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ invalid: 'empty-choices' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const candidates = await wrapper.generateLessonQuestions(request);

    expect(candidates[0].choices).toEqual([]);
    expect(() => validateDynamicLessonQuestions(candidates, validationContext(request))).toThrow(DynamicLessonGenerationError);
  });

  test('no-correct-answer fault returns a candidate whose correctAnswer is absent from choices, rejected by the validator', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ invalid: 'no-correct-answer' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const candidates = await wrapper.generateLessonQuestions(request);

    expect(candidates[0].choices).not.toContain(candidates[0].correctAnswer);
    expect(() => validateDynamicLessonQuestions(candidates, validationContext(request))).toThrow(DynamicLessonGenerationError);
  });

  test('unknown-passage fault returns a candidate citing a passage id outside the request, rejected by the validator', async () => {
    writeFileSync(faultFilePath, JSON.stringify({ invalid: 'unknown-passage' }), 'utf8');
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();
    const knownPassageIds = new Set(request.passages.map((passage) => passage.id));

    const candidates = await wrapper.generateLessonQuestions(request);

    expect(candidates[0].supportingPassageIds.some((id: string) => !knownPassageIds.has(id))).toBe(true);
    expect(() => validateDynamicLessonQuestions(candidates, validationContext(request))).toThrow(DynamicLessonGenerationError);
  });

  test('ignores an unparsable fault file and delegates normally', async () => {
    writeFileSync(faultFilePath, 'not json', 'utf8');
    const inner = new DeterministicGenerationProvider();
    const wrapper = new FaultInjectingGenerationProvider(new DeterministicGenerationProvider(), faultFilePath);
    const request = buildRequest();

    const expected = await inner.generateLessonQuestions(request);
    const actual = await wrapper.generateLessonQuestions(request);

    expect(actual).toEqual(expected);
  });
});
