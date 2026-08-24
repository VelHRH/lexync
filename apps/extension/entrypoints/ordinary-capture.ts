import { resolveStudyPair, studyPairLabel, type StudyPair } from '@lexync/domain';
import { supabase } from '../lib/supabase';

type PairRow = {
  id: string;
  is_primary: boolean;
  reference_language_tag: string;
  target_language_tag: string;
};

type CaptureScope = typeof globalThis & {
  __lexyncActivateOrdinaryCapture?: () => void;
};

function toStudyPair(row: PairRow): StudyPair {
  return {
    id: row.id,
    isPrimary: row.is_primary,
    referenceLanguageTag: row.reference_language_tag,
    targetLanguageTag: row.target_language_tag,
  };
}

export default defineUnlistedScript(() => {
  const scope = globalThis as CaptureScope;

  if (scope.__lexyncActivateOrdinaryCapture) {
    scope.__lexyncActivateOrdinaryCapture();
    return;
  }

  const host = document.createElement('div');
  host.id = 'lexync-ordinary-capture';
  const root = host.attachShadow({ mode: 'open' });
  let active = false;
  let currentExpression = '';

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .prompt {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        max-width: 320px;
        padding: 12px 16px;
        border: 1px solid rgba(25, 37, 30, 0.18);
        border-radius: 999px;
        background: #19251e;
        box-shadow: 0 12px 35px rgba(25, 37, 30, 0.22);
        color: #fbf8ef;
        font: 600 13px/1.4 Arial, Helvetica, sans-serif;
      }
      .dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 32px));
        padding: 24px;
        transform: translate(-50%, -50%);
        border: 1px solid rgba(25, 37, 30, 0.18);
        border-radius: 18px;
        background: #fbf8ef;
        box-shadow: 0 24px 80px rgba(25, 37, 30, 0.3);
        color: #19251e;
        font: 14px/1.45 Arial, Helvetica, sans-serif;
      }
      h2 {
        margin: 0 0 20px;
        font: 400 30px/1 Georgia, 'Times New Roman', serif;
      }
      form, label { display: grid; }
      form { gap: 14px; }
      label { gap: 6px; color: rgba(25, 37, 30, 0.7); font-size: 11px; font-weight: 700; }
      input, select, textarea, button { font: inherit; }
      input, select, textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid rgba(25, 37, 30, 0.18);
        border-radius: 9px;
        background: #fffdf7;
        color: #19251e;
      }
      textarea { min-height: 76px; resize: vertical; }
      .error { color: #9b3328; font-size: 11px; }
      .actions { display: flex; gap: 10px; margin-top: 4px; }
      button {
        padding: 10px 14px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        font-weight: 700;
      }
      button[type='submit'] { background: #19251e; color: #fbf8ef; }
      button[type='button'] { background: #e5e7de; color: #19251e; }
      [hidden] { display: none !important; }
    </style>
    <div class="prompt" role="status" hidden></div>
    <section class="dialog" role="dialog" aria-labelledby="lexync-capture-heading" hidden>
      <h2 id="lexync-capture-heading">Capture Expression</h2>
      <form novalidate>
        <label>Expression<input name="expression" readonly></label>
        <label>Active Study Pair<select name="studyPair"></select><span class="pair-error error" hidden></span></label>
        <label>Translation<input name="translation"><span class="translation-error error" hidden></span></label>
        <label>Example <span>Optional</span><textarea name="example"></textarea></label>
        <div class="actions">
          <button type="submit">Save Vocabulary Entry</button>
          <button type="button">Cancel</button>
        </div>
      </form>
    </section>
  `;

  document.documentElement.append(host);
  const prompt = root.querySelector<HTMLElement>('.prompt')!;
  const dialog = root.querySelector<HTMLElement>('.dialog')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const expressionInput = root.querySelector<HTMLInputElement>('[name="expression"]')!;
  const pairSelect = root.querySelector<HTMLSelectElement>('[name="studyPair"]')!;
  const translationInput = root.querySelector<HTMLInputElement>('[name="translation"]')!;
  const exampleInput = root.querySelector<HTMLTextAreaElement>('[name="example"]')!;
  const pairError = root.querySelector<HTMLElement>('.pair-error')!;
  const translationError = root.querySelector<HTMLElement>('.translation-error')!;
  const cancelButton = root.querySelector<HTMLButtonElement>('button[type="button"]')!;

  function normalizedText(value: string | null): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function sentenceFor(element: Element): string {
    const container = element.closest('p, li, blockquote, figcaption, td, th, div, article, section') ?? element;
    return normalizedText(container.textContent);
  }

  function wordAtPoint(event: MouseEvent): string | null {
    const documentWithCaret = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offset: number; offsetNode: Node } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
    const fallback = documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = position?.offsetNode ?? fallback?.startContainer;
    const offset = position?.offset ?? fallback?.startOffset;

    if (node?.nodeType !== Node.TEXT_NODE || offset === undefined) {
      return null;
    }

    const text = node.textContent ?? '';
    const words = text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’\-‐][\p{L}\p{M}\p{N}]+)*/gu);

    for (const word of words) {
      const start = word.index;
      const end = start + word[0].length;

      if (offset >= start && offset <= end) {
        return word[0];
      }
    }

    return null;
  }

  async function loadStudyPairs() {
    const { data, error } = await supabase
      .from('study_pairs')
      .select('id, is_primary, target_language_tag, reference_language_tag')
      .order('created_at');

    if (error) {
      throw error;
    }

    const pairs = (data as PairRow[]).map(toStudyPair);
    const rememberedKey = `lexync.websiteStudyPair.${location.origin}`;
    const stored = await browser.storage.local.get(rememberedKey);
    const rememberedStudyPairId = typeof stored[rememberedKey] === 'string'
      ? stored[rememberedKey]
      : undefined;
    const detectedTargetLanguageTag = document.documentElement.lang;
    const resolution = resolveStudyPair(pairs, {
      detectedTargetLanguageTag,
      detectionReliable: Boolean(detectedTargetLanguageTag),
      rememberedStudyPairId,
    });

    pairSelect.replaceChildren();

    if (resolution.kind === 'choice-required') {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose a Study Pair';
      pairSelect.append(placeholder);
    }

    for (const pair of pairs) {
      const option = document.createElement('option');
      option.value = pair.id;
      option.textContent = studyPairLabel(pair);
      option.selected = resolution.kind === 'resolved' && pair.id === resolution.studyPair.id;
      pairSelect.append(option);
    }
  }

  async function openCapture(expression: string, source: Element) {
    active = false;
    currentExpression = expression.trim();
    prompt.hidden = true;
    dialog.hidden = false;
    expressionInput.value = currentExpression;
    translationInput.value = '';
    exampleInput.value = sentenceFor(source);
    pairError.hidden = true;
    translationError.hidden = true;

    try {
      await loadStudyPairs();
      translationInput.focus();
    } catch (error) {
      dialog.hidden = true;
      prompt.textContent = error instanceof Error ? error.message : 'Study Pairs could not be loaded.';
      prompt.hidden = false;
    }
  }

  function deactivate() {
    active = false;
    host.hidden = true;
    dialog.hidden = true;
    prompt.hidden = true;
  }

  function activate() {
    host.hidden = false;
    dialog.hidden = true;
    prompt.textContent = 'Click a word or select a phrase. Press Escape to cancel.';
    prompt.hidden = false;
    active = true;
  }

  document.addEventListener('mouseup', (event) => {
    if (!active || event.composedPath().includes(host)) {
      return;
    }

    const selection = document.getSelection();
    const expression = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    const sourceNode = selection?.rangeCount ? selection.getRangeAt(0).commonAncestorContainer : null;
    const source = sourceNode instanceof Element ? sourceNode : sourceNode?.parentElement;

    if (expression && source) {
      void openCapture(expression, source);
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!active || event.composedPath().includes(host)) {
      return;
    }

    const selection = document.getSelection();

    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      return;
    }

    const source = event.target instanceof Element ? event.target : null;
    const expression = wordAtPoint(event);

    if (source && expression) {
      event.preventDefault();
      event.stopPropagation();
      void openCapture(expression, source);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !host.hidden) {
      deactivate();
    }
  }, true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const translation = translationInput.value.trim();
    const studyPairId = pairSelect.value;
    pairError.hidden = Boolean(studyPairId);
    translationError.hidden = Boolean(translation);
    pairError.textContent = studyPairId ? '' : 'Study Pair is required.';
    translationError.textContent = translation ? '' : 'Translation is required.';

    if (!studyPairId || !translation) {
      return;
    }

    const submitButton = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitButton.disabled = true;
    const { error } = await supabase.rpc('capture_manual_entry', {
      p_example: exampleInput.value || null,
      p_expression: currentExpression,
      p_study_pair_id: studyPairId,
      p_translation: translation,
    });
    submitButton.disabled = false;

    if (error) {
      prompt.textContent = error.message;
      dialog.hidden = true;
      prompt.hidden = false;
      return;
    }

    await browser.storage.local.set({ [`lexync.websiteStudyPair.${location.origin}`]: studyPairId });
    dialog.hidden = true;
    prompt.textContent = 'Vocabulary Entry saved.';
    prompt.hidden = false;
  });

  cancelButton.addEventListener('click', deactivate);
  scope.__lexyncActivateOrdinaryCapture = activate;
  activate();
});
