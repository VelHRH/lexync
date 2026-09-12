import { canonicalLanguageTag, languageName, resolveAnswerLanguage } from '@lexync/domain';
import { shadowTokenCss } from '@lexync/design-system';
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
  let currentLearningLanguageId = '';
  let answerLanguageConfirmed = false;
  let senseId: string | undefined;
  let createNewSense = false;
  let preferredAnswerLanguageTag = '';
  let answerLanguageDetectionRevision = 0;

  root.innerHTML = `
    <style>
      ${shadowTokenCss}
      * { box-sizing: border-box; }
      .prompt {
        position: fixed;
        inset-inline-end: var(--lexync-space-6);
        bottom: var(--lexync-space-6);
        z-index: var(--lexync-z-injected);
        max-width: 340px;
        padding: var(--lexync-space-3) var(--lexync-space-4);
        border: 1px solid var(--lexync-color-border-strong);
        border-radius: var(--lexync-radius-md);
        background: var(--lexync-color-surface);
        box-shadow: var(--lexync-elevation-medium);
        color: var(--lexync-color-ink);
        font: var(--lexync-type-weight-semibold) var(--lexync-type-size-sm)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
      }
      .dialog {
        position: fixed;
        inset-inline-end: var(--lexync-space-6);
        bottom: var(--lexync-space-6);
        z-index: var(--lexync-z-injected);
        width: min(400px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: var(--lexync-space-5);
        border: 1px solid var(--lexync-color-border);
        border-radius: var(--lexync-radius-md);
        background: var(--lexync-color-surface);
        box-shadow: var(--lexync-elevation-high);
        color: var(--lexync-color-ink);
        font: var(--lexync-type-size-md)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
      }
      .dialog-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--lexync-space-4);
        margin-bottom: var(--lexync-space-5);
      }
      .kicker {
        margin: 0 0 var(--lexync-space-2);
        color: var(--lexync-color-brand-primary);
        font-size: var(--lexync-type-size-xs);
        font-weight: var(--lexync-type-weight-bold);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      h2 {
        margin: 0;
        color: var(--lexync-color-ink);
        font: var(--lexync-type-weight-semibold) var(--lexync-type-size-xl)/var(--lexync-type-line-tight) var(--lexync-type-family-body);
      }
      .context-mark { color: var(--lexync-color-ink-muted); font: var(--lexync-type-weight-bold) var(--lexync-type-size-xs)/var(--lexync-type-line-normal) var(--lexync-type-family-mono); }
      form, label { display: grid; }
      form { gap: var(--lexync-space-4); }
      label { gap: var(--lexync-space-2); color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); font-weight: var(--lexync-type-weight-semibold); }
      input, select, textarea, button { font: inherit; }
      input, select, textarea {
        width: 100%;
        padding: var(--lexync-space-3);
        border: 1px solid var(--lexync-color-border-strong);
        border-radius: var(--lexync-radius-md);
        outline: none;
        background: var(--lexync-color-white);
        color: var(--lexync-color-ink);
      }
      select {
        appearance: none;
        -webkit-appearance: none;
        padding-inline-end: var(--lexync-space-10);
        background-image: linear-gradient(45deg, transparent 50%, var(--lexync-color-brand-primary) 50%), linear-gradient(135deg, var(--lexync-color-brand-primary) 50%, transparent 50%);
        background-position: calc(100% - var(--lexync-space-3)) center, calc(100% - var(--lexync-space-2)) center;
        background-repeat: no-repeat;
        background-size: 0.35rem 0.35rem, 0.35rem 0.35rem;
      }
      input:focus, select:focus, textarea:focus { border-color: var(--lexync-color-brand-primary); }
      input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible { outline: var(--lexync-focus-width) solid var(--lexync-focus-color); outline-offset: var(--lexync-focus-offset); box-shadow: var(--lexync-focus-ring); }
      textarea { min-height: 76px; resize: vertical; }
      .field-error, .validation-error { color: var(--lexync-color-danger); font-size: var(--lexync-type-size-xs); }
      .validation-error { margin: 0; }
      .actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--lexync-space-3); margin-top: var(--lexync-space-1); }
      button {
        min-height: 2.75rem;
        padding: var(--lexync-space-3) var(--lexync-space-4);
        border: 1px solid transparent;
        border-radius: var(--lexync-radius-sm);
        cursor: pointer;
        font-weight: var(--lexync-type-weight-bold);
      }
      button[type='submit'] { border-color: var(--lexync-color-brand-primary); background: var(--lexync-color-brand-primary); color: var(--lexync-color-white); }
      button[type='button'] { border-color: var(--lexync-color-border-strong); background: var(--lexync-color-surface-subtle); color: var(--lexync-color-ink); }
      button:active { transform: translateY(1px); }
      button:disabled { cursor: wait; opacity: 0.55; }
      [hidden] { display: none !important; }
    </style>
    <div class="prompt" role="status" hidden></div>
    <section class="dialog capture-sheet" role="dialog" aria-modal="true" aria-label="Capture Expression" hidden>
      <header class="dialog-header"><div><p class="kicker">Quick capture</p><h2 id="lexync-capture-heading">Keep this expression</h2></div><span class="context-mark">LEXYNC</span></header>
      <form novalidate>
        <label>Expression<input name="expression" readonly></label>
        <label>Learning Language<select name="learningLanguage"></select><span class="pair-error field-error" hidden></span></label>
        <label>Translation<input name="translation"><span class="translation-error field-error" hidden></span></label>
        <label>Answer Language<input name="answerLanguage" autocomplete="off"><span class="answer-language-error field-error" hidden></span></label>
        <label class="answer-language-confirmation" hidden><input name="confirmAnswerLanguage" type="checkbox"> Confirm this Answer Language</label>
        <fieldset class="sense-choice" hidden><legend>Choose a Sense</legend><div class="sense-options"></div><label><input name="createNewSense" type="radio" value="new"> Create a new Sense</label></fieldset>
        <label>Example <span>Optional</span><textarea name="example"></textarea></label>
        <p class="validation-error" role="alert" hidden>Please complete the highlighted fields.</p>
        <div class="actions sheet-actions">
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
  const languageSelect = root.querySelector<HTMLSelectElement>('[name="learningLanguage"]')!;
  const translationInput = root.querySelector<HTMLInputElement>('[name="translation"]')!;
  const exampleInput = root.querySelector<HTMLTextAreaElement>('[name="example"]')!;
  const pairError = root.querySelector<HTMLElement>('.pair-error')!;
  const translationError = root.querySelector<HTMLElement>('.translation-error')!;
  const answerLanguageInput = root.querySelector<HTMLInputElement>('[name="answerLanguage"]')!;
  const answerLanguageError = root.querySelector<HTMLElement>('.answer-language-error')!;
  const validationError = root.querySelector<HTMLElement>('.validation-error')!;
  const answerLanguageConfirmation = root.querySelector<HTMLLabelElement>('.answer-language-confirmation')!;
  const confirmAnswerLanguage = root.querySelector<HTMLInputElement>('[name="confirmAnswerLanguage"]')!;
  const senseChoice = root.querySelector<HTMLElement>('.sense-choice')!;
  const senseOptions = root.querySelector<HTMLElement>('.sense-options')!;
  const createNewSenseInput = root.querySelector<HTMLInputElement>('[name="createNewSense"]')!;
  const cancelButton = root.querySelector<HTMLButtonElement>('button[type="button"]')!;

  function showPrompt(message: string, role: 'alert' | 'status' = 'status') {
    prompt.setAttribute('role', role);
    prompt.textContent = message;
    prompt.hidden = false;
  }

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

  async function loadLearningLanguages() {
    const response = await browser.runtime.sendMessage({
      origin: location.origin,
      type: 'ordinary-capture:load',
    }) as LoadOrdinaryCaptureResponse;

    if (response.error) {
      throw new Error(response.error);
    }

    languageSelect.replaceChildren();
    for (const language of response.learningLanguages) {
      const placeholder = document.createElement('option');
      placeholder.value = language.id;
      placeholder.textContent = languageName(language.languageTag);
      placeholder.selected = language.id === response.activeLearningLanguageId;
      languageSelect.append(placeholder);
    }
    currentLearningLanguageId = response.activeLearningLanguageId ?? response.learningLanguages[0]?.id ?? '';
    languageSelect.value = currentLearningLanguageId;
    answerLanguageInput.value = response.answerLanguageTag ?? '';
    preferredAnswerLanguageTag = response.answerLanguageTag ?? '';
  }

  function updateSubmitState() {
    const submitButton = root.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submitButton) return;
    submitButton.disabled = !currentLearningLanguageId
      || !translationInput.value.trim()
      || !canonicalLanguageTag(answerLanguageInput.value)
      || (!answerLanguageConfirmation.hidden && !answerLanguageConfirmed)
      || (senseChoice.hidden === false && !senseId && !createNewSense);
  }

  async function openCaptureValues(expression: string, example: string) {
    active = false;
    answerLanguageDetectionRevision += 1;
    currentExpression = expression.trim();
    prompt.hidden = true;
    dialog.hidden = false;
    expressionInput.value = currentExpression;
    translationInput.value = '';
    answerLanguageInput.value = '';
    exampleInput.value = example;
    senseId = undefined;
    createNewSense = false;
    answerLanguageConfirmed = false;
    confirmAnswerLanguage.checked = false;
    answerLanguageConfirmation.hidden = true;
    senseChoice.hidden = true;
    pairError.hidden = true;
    translationError.hidden = true;
    validationError.hidden = true;

    try {
      await loadLearningLanguages();
      translationInput.focus();
    } catch (error) {
      dialog.hidden = true;
      showPrompt(error instanceof Error ? error.message : 'Learning Languages could not be loaded.', 'alert');
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
    showPrompt('Click a word or select a phrase. Press Escape to cancel.');
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

  translationInput.addEventListener('input', () => {
    const detectionRevision = ++answerLanguageDetectionRevision;
    void browser.runtime.sendMessage({
      text: translationInput.value,
      type: 'ordinary-capture:detect-answer-language',
    }).then((result: { languageTag?: string; reliable: boolean }) => {
      if (detectionRevision !== answerLanguageDetectionRevision) {
        return;
      }

      const resolution = resolveAnswerLanguage({
        detectedAnswerLanguageTag: result.languageTag,
        detectionConfidence: result.reliable ? 1 : 0,
        detectionReliable: result.reliable,
        preferredAnswerLanguageTag,
      });
      answerLanguageInput.value = resolution.answerLanguageTag ?? '';
      answerLanguageConfirmation.hidden = !resolution.confirmationRequired;
      answerLanguageConfirmed = !resolution.confirmationRequired;
      confirmAnswerLanguage.checked = false;
      updateSubmitState();
    });
  });
  answerLanguageInput.addEventListener('input', () => {
    answerLanguageDetectionRevision += 1;
    if (!answerLanguageConfirmation.hidden) {
      answerLanguageConfirmed = false;
      confirmAnswerLanguage.checked = false;
    }
    updateSubmitState();
  });
  confirmAnswerLanguage.addEventListener('change', () => {
    answerLanguageConfirmed = confirmAnswerLanguage.checked;
    updateSubmitState();
  });
  languageSelect.addEventListener('change', () => {
    currentLearningLanguageId = languageSelect.value;
    updateSubmitState();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const translation = translationInput.value.trim();
    const learningLanguageId = languageSelect.value;
    const answerLanguageTag = canonicalLanguageTag(answerLanguageInput.value);
    pairError.hidden = Boolean(learningLanguageId);
    translationError.hidden = Boolean(translation);
    answerLanguageError.hidden = Boolean(answerLanguageTag);
    pairError.textContent = learningLanguageId ? '' : 'Learning Language is required.';
    translationError.textContent = translation ? '' : 'Translation is required.';
    answerLanguageError.textContent = answerLanguageTag ? '' : 'Answer Language is required.';
    validationError.hidden = Boolean(learningLanguageId && translation && answerLanguageTag && (answerLanguageConfirmed || answerLanguageConfirmation.hidden));

    if (!learningLanguageId || !translation || !answerLanguageTag || (!answerLanguageConfirmed && answerLanguageConfirmation.hidden === false)) {
      return;
    }

    const submitButton = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitButton.disabled = true;
    const response = await browser.runtime.sendMessage({
      example: exampleInput.value || null,
      expression: currentExpression,
      answerLanguageTag,
      createNewSense,
      learningLanguageId,
      origin: location.origin,
      senseId,
      translation,
      type: 'ordinary-capture:save',
    }) as SaveOrdinaryCaptureResponse;
    submitButton.disabled = false;

    if ('error' in response) {
      dialog.hidden = true;
      showPrompt(response.error, 'alert');
      return;
    }

    if (response.kind === 'needs_sense') {
      senseChoice.hidden = false;
      senseOptions.replaceChildren();
      for (const sense of response.senses) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.name = 'sense';
        input.type = 'radio';
        input.value = sense.id;
        input.addEventListener('change', () => {
          senseId = sense.id;
          createNewSense = false;
          submitButton.disabled = false;
        });
        label.append(input, document.createTextNode(sense.translations.map((item) => `${item.text} (${item.answerLanguageTag})`).join(' · ') || 'Existing Sense'));
        senseOptions.append(label);
      }
      createNewSenseInput.checked = false;
      createNewSenseInput.onchange = () => {
        createNewSense = createNewSenseInput.checked;
        senseId = undefined;
        submitButton.disabled = !createNewSenseInput.checked;
      };
      submitButton.disabled = true;
      showPrompt('Choose a Sense or create a new Sense before saving.');
      return;
    }

    dialog.hidden = true;
    showPrompt('Vocabulary Entry saved. Click another word or select a phrase.');
    active = true;
  });

  cancelButton.addEventListener('click', activate);
  scope.__lexyncActivateOrdinaryCapture = activate;
  scope.__lexyncDeactivateOrdinaryCapture = deactivate;
  scope.__lexyncOpenOrdinaryCapture = (expression, example) => void openCaptureValues(expression, example);
  activate();
});
