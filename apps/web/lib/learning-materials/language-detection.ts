import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { canonicalLanguageTag } from '@lexync/domain';

export const GEMINI_LANGUAGE_DETECTION_MODEL = 'gemini-3.8-flash';

const DETECTION_SAMPLE_LENGTH = 4000;

export type LanguageVerdict = {
  matches: boolean;
  detectedLanguage: string | null;
};

export type LanguageDetectionProvider = {
  readonly model: string;
  detect(text: string, expectedLanguageTag: string): Promise<LanguageVerdict>;
};

const scriptPatterns = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Han', /\p{Script=Han}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Armenian', /\p{Script=Armenian}/u],
] as const;

const scriptByPrimarySubtag = new Map<string, string>([
  ['ar', 'Arabic'],
  ['be', 'Cyrillic'],
  ['bg', 'Cyrillic'],
  ['el', 'Greek'],
  ['fa', 'Arabic'],
  ['he', 'Hebrew'],
  ['hi', 'Devanagari'],
  ['hy', 'Armenian'],
  ['ja', 'Hiragana'],
  ['ka', 'Georgian'],
  ['ko', 'Hangul'],
  ['mk', 'Cyrillic'],
  ['ru', 'Cyrillic'],
  ['sr', 'Cyrillic'],
  ['th', 'Thai'],
  ['uk', 'Cyrillic'],
  ['zh', 'Han'],
]);

export function primarySubtag(languageTag: string): string {
  return (canonicalLanguageTag(languageTag) ?? languageTag).split('-')[0].toLowerCase();
}

export function dominantScript(text: string): string | null {
  const counts = new Map<string, number>();
  for (const character of text.slice(0, DETECTION_SAMPLE_LENGTH)) {
    for (const [script, pattern] of scriptPatterns) {
      if (!pattern.test(character)) continue;
      counts.set(script, (counts.get(script) ?? 0) + 1);
      break;
    }
  }
  const japanese = (counts.get('Hiragana') ?? 0) + (counts.get('Katakana') ?? 0);
  if (japanese > 0) {
    counts.set('Hiragana', japanese);
    counts.delete('Katakana');
  }
  const ranked = [...counts.entries()].sort(([, first], [, second]) => second - first);
  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  if (!ranked.length || total === 0) return null;
  return ranked[0][1] / total >= 0.5 ? ranked[0][0] : null;
}

export class ScriptLanguageDetectionProvider implements LanguageDetectionProvider {
  readonly model = 'script';

  async detect(text: string, expectedLanguageTag: string): Promise<LanguageVerdict> {
    const expectedScript = scriptByPrimarySubtag.get(primarySubtag(expectedLanguageTag)) ?? 'Latin';
    const detected = dominantScript(text);
    if (!detected) return { matches: true, detectedLanguage: null };
    return { matches: detected === expectedScript, detectedLanguage: null };
  }
}

const DETECTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    languageTag: { type: 'string' },
  },
  required: ['languageTag'],
} as const;

export class GeminiLanguageDetectionProvider implements LanguageDetectionProvider {
  readonly model = GEMINI_LANGUAGE_DETECTION_MODEL;
  private readonly chatModel: ChatGoogleGenerativeAI;
  private readonly fallback = new ScriptLanguageDetectionProvider();

  constructor(apiKey: string) {
    this.chatModel = new ChatGoogleGenerativeAI({ apiKey, model: GEMINI_LANGUAGE_DETECTION_MODEL, maxRetries: 2 });
  }

  async detect(text: string, expectedLanguageTag: string): Promise<LanguageVerdict> {
    const sample = text.slice(0, DETECTION_SAMPLE_LENGTH);
    const structured = this.chatModel.withStructuredOutput(DETECTION_JSON_SCHEMA, { name: 'dominant_language' });
    const prompt = [
      'Name the dominant language of the text below.',
      'Answer with one BCP 47 language tag, such as "es" or "pt-BR".',
      'Judge the language the text is mostly written in, ignoring quoted words, names, and short glosses in other languages.',
      'Answer with "und" when the text carries too little language to judge.',
      '',
      sample,
    ].join('\n');
    const result = await structured.invoke(prompt) as { languageTag?: unknown };
    const detectedTag = typeof result?.languageTag === 'string' ? result.languageTag.trim() : '';
    if (!detectedTag || detectedTag.toLowerCase() === 'und') return { matches: true, detectedLanguage: null };
    const canonical = canonicalLanguageTag(detectedTag);
    if (!canonical) return this.fallback.detect(text, expectedLanguageTag);
    return {
      matches: primarySubtag(canonical) === primarySubtag(expectedLanguageTag),
      detectedLanguage: canonical,
    };
  }
}

export function createLanguageDetectionProvider(): LanguageDetectionProvider {
  const provider = process.env.LEXYNC_LANGUAGE_DETECTION_PROVIDER;
  if (provider === 'script') return new ScriptLanguageDetectionProvider();
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for the Gemini language detection provider.');
    return new GeminiLanguageDetectionProvider(apiKey);
  }
  throw new Error('LEXYNC_LANGUAGE_DETECTION_PROVIDER must be explicitly set to script or gemini.');
}
