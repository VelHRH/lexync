import { canonicalLanguageTag, languageName, resolveAnswerLanguage } from '@lexync/domain';
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
        <label>Learning Language<select name="learningLanguage"></select><span class="pair-error error" hidden></span></label>
        <label>Translation<input name="translation"><span class="translation-error error" hidden></span></label>
        <label>Answer Language<input name="answerLanguage" autocomplete="off"><span class="answer-language-error error" hidden></span></label>
        <label class="answer-language-confirmation" hidden><input name="confirmAnswerLanguage" type="checkbox"> Confirm this Answer Language</label>
        <fieldset class="sense-choice" hidden><legend>Choose a Sense</legend><div class="sense-options"></div><label><input name="createNewSense" type="radio" value="new"> Create a new Sense</label></fieldset>
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
  const languageSelect = root.querySelector<HTMLSelectElement>('[name="learningLanguage"]')!;
  const translationInput = root.querySelector<HTMLInputElement>('[name="translation"]')!;
  const exampleInput = root.querySelector<HTMLTextAreaElement>('[name="example"]')!;
  const pairError = root.querySelector<HTMLElement>('.pair-error')!;
  const translationError = root.querySelector<HTMLElement>('.translation-error')!;
  const answerLanguageInput = root.querySelector<HTMLInputElement>('[name="answerLanguage"]')!;
  const answerLanguageError = root.querySelector<HTMLElement>('.answer-language-error')!;
  const answerLanguageConfirmation = root.querySelector<HTMLLabelElement>('.answer-language-confirmation')!;
  const confirmAnswerLanguage = root.querySelector<HTMLInputElement>('[name="confirmAnswerLanguage"]')!;
  const senseChoice = root.querySelector<HTMLElement>('.sense-choice')!;
  const senseOptions = root.querySelector<HTMLElement>('.sense-options')!;
  const createNewSenseInput = root.querySelector<HTMLInputElement>('[name="createNewSense"]')!;
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

    try {
      await loadLearningLanguages();
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

  translationInput.addEventListener('input', () => {
    void browser.runtime.sendMessage({
      text: translationInput.value,
      type: 'ordinary-capture:detect-answer-language',
    }).then((result: { languageTag?: string; reliable: boolean }) => {
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
  answerLanguageInput.addEventListener('input', updateSubmitState);
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
      prompt.textContent = response.error;
      dialog.hidden = true;
      prompt.hidden = false;
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
      prompt.textContent = 'Choose a Sense or create a new Sense before saving.';
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
