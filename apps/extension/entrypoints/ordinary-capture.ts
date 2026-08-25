import { studyPairLabel } from '@lexync/domain';
import type {
  LoadOrdinaryCaptureResponse,
  SaveOrdinaryCaptureResponse,
} from '../lib/ordinary-capture-messages';

type CaptureScope = typeof globalThis & {
  __lexyncActivateOrdinaryCapture?: () => void;
  __lexyncDeactivateOrdinaryCapture?: () => void;
  __lexyncOpenOrdinaryCapture?: (expression: string, example: string) => void;
};

type CapturedText = {
  expression: string;
  range: Range;
  source: Element;
};

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

  function sentenceFor(range: Range, source: Element): string {
    const container = source.closest('p, li, blockquote, figcaption, td, th, div, article, section') ?? source;
    const text = container.textContent ?? '';
    const prefix = document.createRange();
    prefix.selectNodeContents(container);

    try {
      prefix.setEnd(range.startContainer, range.startOffset);
    } catch {
      return normalizedText(text);
    }

    const expressionOffset = prefix.toString().length;
    const locale = document.documentElement.lang || undefined;

    for (const sentence of new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)) {
      if (expressionOffset >= sentence.index && expressionOffset < sentence.index + sentence.segment.length) {
        return normalizedText(sentence.segment);
      }
    }

    return normalizedText(text);
  }

  function wordAtPoint(event: MouseEvent): CapturedText | null {
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
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const source = node.parentElement;
        return source ? { expression: word[0], range, source } : null;
      }
    }

    return null;
  }

  async function loadStudyPairs() {
    const response = await browser.runtime.sendMessage({
      detectedTargetLanguageTag: document.documentElement.lang,
      origin: location.origin,
      type: 'ordinary-capture:load',
    }) as LoadOrdinaryCaptureResponse;

    if (response.error) {
      throw new Error(response.error);
    }

    pairSelect.replaceChildren();

    if (!response.selectedStudyPairId) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose a Study Pair';
      pairSelect.append(placeholder);
    }

    for (const pair of response.pairs) {
      const option = document.createElement('option');
      option.value = pair.id;
      option.textContent = studyPairLabel(pair);
      option.selected = pair.id === response.selectedStudyPairId;
      pairSelect.append(option);
    }
  }

  async function openCaptureValues(expression: string, example: string) {
    active = false;
    currentExpression = expression.trim();
    prompt.hidden = true;
    dialog.hidden = false;
    expressionInput.value = currentExpression;
    translationInput.value = '';
    exampleInput.value = example;
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

  async function openCapture(capturedText: CapturedText) {
    await openCaptureValues(
      capturedText.expression,
      sentenceFor(capturedText.range, capturedText.source),
    );
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

  function isLexyncUi(event: Event) {
    return event.composedPath().some((target) => target instanceof Element
      && (target.id === 'lexync-ordinary-capture'
        || target.id === 'lexync-learning-mode'
        || target.matches('[data-lexync-saved="true"]')));
  }

  document.addEventListener('mouseup', (event) => {
    if (!active || isLexyncUi(event)) {
      return;
    }

    const selection = document.getSelection();
    const expression = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const sourceNode = range?.commonAncestorContainer ?? null;
    const source = sourceNode instanceof Element ? sourceNode : sourceNode?.parentElement;

    if (expression && range && source) {
      void openCapture({ expression, range, source });
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!active || isLexyncUi(event)) {
      return;
    }

    const selection = document.getSelection();

    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      return;
    }

    const capturedText = wordAtPoint(event);

    if (capturedText) {
      event.preventDefault();
      event.stopPropagation();
      void openCapture(capturedText);
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
    const response = await browser.runtime.sendMessage({
      example: exampleInput.value || null,
      expression: currentExpression,
      origin: location.origin,
      studyPairId,
      translation,
      type: 'ordinary-capture:save',
    }) as SaveOrdinaryCaptureResponse;
    submitButton.disabled = false;

    if (response.error) {
      prompt.textContent = response.error;
      dialog.hidden = true;
      prompt.hidden = false;
      return;
    }

    dialog.hidden = true;
    prompt.textContent = 'Vocabulary Entry saved. Click another word or select a phrase.';
    prompt.hidden = false;
    active = true;
  });

  cancelButton.addEventListener('click', activate);
  scope.__lexyncActivateOrdinaryCapture = activate;
  scope.__lexyncDeactivateOrdinaryCapture = deactivate;
  scope.__lexyncOpenOrdinaryCapture = (expression, example) => void openCaptureValues(expression, example);
  activate();
});
