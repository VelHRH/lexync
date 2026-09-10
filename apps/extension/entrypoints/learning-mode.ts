import type { LearningModeEntry, LearningModeLoadResponse } from '../lib/learning-mode-messages';
import { shadowTokenCss } from '@lexync/design-system';

type LearningScope = typeof globalThis & {
  __lexyncLearningMode?: boolean;
  __lexyncDeactivateOrdinaryCapture?: () => void;
  __lexyncOpenOrdinaryCapture?: (expression: string, example: string) => void;
};

export default defineUnlistedScript(async () => {
  const scope = globalThis as LearningScope;

  if (scope.__lexyncLearningMode) {
    return;
  }

  scope.__lexyncLearningMode = true;
  const textSample = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 20_000);
  const response = await browser.runtime.sendMessage({
    origin: location.origin,
    textSample,
    type: 'learning-mode:load',
  }) as LearningModeLoadResponse;

  if (!response.permitted || (response.decided && !response.enabled)
    || (!response.enabled && !response.selectedLearningLanguageId)) {
    scope.__lexyncLearningMode = false;
    return;
  }

  const host = document.createElement('div');
  host.id = 'lexync-learning-mode';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${shadowTokenCss}
      * { box-sizing: border-box; }
      .card, .details {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: var(--lexync-z-injected);
        width: min(340px, calc(100vw - 40px));
        max-height: calc(100vh - 40px);
        overflow: auto;
        padding: var(--lexync-space-5);
        border: 1px solid var(--lexync-color-border);
        border-radius: var(--lexync-radius-lg);
        background: var(--lexync-color-surface);
        box-shadow: var(--lexync-elevation-high);
        color: var(--lexync-color-ink);
        font: var(--lexync-type-size-md)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
      }
      h2 { margin: 0 0 var(--lexync-space-2); font: var(--lexync-type-weight-semibold) var(--lexync-type-size-xl)/var(--lexync-type-line-tight) var(--lexync-type-family-display); }
      p { margin: 0 0 var(--lexync-space-4); color: var(--lexync-color-ink-muted); }
      label { display: grid; gap: var(--lexync-space-2); margin: var(--lexync-space-3) 0; color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); font-weight: var(--lexync-type-weight-semibold); }
      select { width: 100%; min-height: 2.75rem; padding: var(--lexync-space-2) var(--lexync-space-3); border: 1px solid var(--lexync-color-border-strong); border-radius: var(--lexync-radius-md); outline: none; background: var(--lexync-color-white); color: var(--lexync-color-ink); }
      select:focus { border-color: var(--lexync-color-brand-primary); }
      .actions { display: flex; flex-wrap: wrap; gap: var(--lexync-space-2); }
      button { min-height: 2.75rem; padding: var(--lexync-space-2) var(--lexync-space-3); border: 1px solid transparent; border-radius: var(--lexync-radius-md); cursor: pointer; font: var(--lexync-type-weight-bold) var(--lexync-type-size-sm)/var(--lexync-type-line-normal) var(--lexync-type-family-body); }
      button:active { transform: translateY(1px); }
      button:disabled { cursor: wait; opacity: .55; }
      .primary { border-color: var(--lexync-color-brand-primary); background: var(--lexync-color-brand-primary); color: var(--lexync-color-white); }
      .secondary { border-color: var(--lexync-color-border-strong); background: var(--lexync-color-surface-subtle); color: var(--lexync-color-ink); }
      .mode-status {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: calc(var(--lexync-z-injected) - 1);
        padding: var(--lexync-space-2) var(--lexync-space-3);
        border-radius: var(--lexync-radius-pill);
        border-color: var(--lexync-color-ink);
        background: var(--lexync-color-ink);
        color: var(--lexync-color-white);
        font-size: var(--lexync-type-size-xs);
      }
      .add {
        position: fixed;
        z-index: var(--lexync-z-injected);
        padding: var(--lexync-space-1) var(--lexync-space-2);
        border-radius: var(--lexync-radius-pill);
        background: var(--lexync-color-brand-primary);
        color: var(--lexync-color-white);
        box-shadow: var(--lexync-elevation-low);
        font: var(--lexync-type-weight-bold) var(--lexync-type-size-xs)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
        pointer-events: none;
      }
      .details { right: 20px; bottom: 64px; }
      .translation-tooltip {
        position: fixed;
        z-index: var(--lexync-z-injected);
        max-width: min(280px, calc(100vw - 16px));
        padding: var(--lexync-space-2) var(--lexync-space-3);
        border-radius: var(--lexync-radius-md);
        background: var(--lexync-color-ink);
        box-shadow: var(--lexync-elevation-medium);
        color: var(--lexync-color-white);
        font: var(--lexync-type-weight-semibold) var(--lexync-type-size-xs)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
        pointer-events: none;
      }
      .sense { padding: var(--lexync-space-3) 0; border-top: 1px solid var(--lexync-color-border); }
      .sense strong, .sense span { display: block; }
      [hidden] { display: none !important; }
    </style>
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="lexync-learning-heading" hidden>
      <h2 id="lexync-learning-heading">Learning Mode</h2>
      <p class="proposal"></p>
      <label hidden>Learning Language<select></select></label>
      <div class="actions"><button class="primary enable">Enable</button><button class="secondary decline">Not now</button></div>
    </section>
    <button class="mode-status" type="button" aria-label="Disable Learning Mode" title="Turn off Learning Mode" hidden>Learning Mode is on</button>
    <div class="add" role="tooltip" hidden></div>
    <div class="translation-tooltip" role="tooltip" hidden></div>
    <section class="details" role="dialog" aria-label="Saved expression" hidden></section>
  `;
  document.documentElement.append(host);
  const hoverStyle = document.createElement('style');
  hoverStyle.textContent = '[data-lexync-hover="true"] { cursor: pointer !important; text-decoration: underline 1px !important; text-underline-offset: 3px; }';
  document.documentElement.append(hoverStyle);
  const card = root.querySelector<HTMLElement>('.card')!;
  const proposal = root.querySelector<HTMLElement>('.proposal')!;
  const languageLabel = root.querySelector<HTMLLabelElement>('label')!;
  const languageSelect = root.querySelector<HTMLSelectElement>('select')!;
  const enableButton = root.querySelector<HTMLButtonElement>('.enable')!;
  const declineButton = root.querySelector<HTMLButtonElement>('.decline')!;
  const status = root.querySelector<HTMLButtonElement>('.mode-status')!;
  const addHint = root.querySelector<HTMLElement>('.add')!;
  const translationTooltip = root.querySelector<HTMLElement>('.translation-tooltip')!;
  const details = root.querySelector<HTMLElement>('.details')!;
  let hoverMark: HTMLElement | null = null;
  let hoveredSource: Element | null = null;
  let hoveredExpression = '';
  let entries = response.entries;
  let modeEnabled = response.enabled;
  let hoverTimeout: number | undefined;

  function languageName(tag?: string): string {
    if (!tag) {
      return 'this language';
    }

    try {
      return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(tag) ?? tag;
    } catch {
      return tag;
    }
  }

  function showDetails(entry: LearningModeEntry) {
    translationTooltip.hidden = true;
    const senses = entry.senses.map((sense) => `
      <div class="sense">
        ${sense.translations.map((translation) => `<strong>${escapeMarkup(translation.text)} (${escapeMarkup(languageName(translation.answerLanguageTag))})</strong>`).join('')}
        ${sense.examples.map((example) => `<span>${escapeMarkup(example)}</span>`).join('')}
      </div>
    `).join('');
    details.innerHTML = `<h2>${escapeMarkup(entry.expression)}</h2>${senses}<div class="actions"><button class="primary add-translation" type="button">Add translation</button><button class="secondary close" type="button">Close</button></div>`;
    details.hidden = false;
    details.querySelector<HTMLButtonElement>('.add-translation')?.addEventListener('click', () => {
      const example = entry.senses.flatMap((sense) => sense.examples)[0] ?? '';
      details.hidden = true;
      void browser.runtime.sendMessage({ type: 'learning-mode:start-capture' }).then(() => {
        scope.__lexyncOpenOrdinaryCapture?.(entry.expression, example);
      });
    });
    details.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => {
      details.hidden = true;
    });
  }

  function showTranslationTooltip(entry: LearningModeEntry, mark: HTMLElement) {
    const translations = [...new Map(entry.senses.flatMap((sense) => sense.translations).map((translation) => [
      `${translation.text}\u0000${translation.answerLanguageTag}`, translation,
    ])).values()];
    translationTooltip.textContent = translations.map((translation) => `${translation.text} (${languageName(translation.answerLanguageTag)})`).join(' · ');

    if (!translationTooltip.textContent) {
      return;
    }

    translationTooltip.hidden = false;
    const rect = mark.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, innerWidth - translationTooltip.offsetWidth - 8));
    const top = rect.top - translationTooltip.offsetHeight - 8;
    translationTooltip.style.left = `${left}px`;
    translationTooltip.style.top = `${top >= 8 ? top : rect.bottom + 8}px`;
  }

  function escapeMarkup(value: string): string {
    const element = document.createElement('span');
    element.textContent = value;
    return element.innerHTML;
  }

  function eligibleTextNode(node: Node): node is Text {
    const parent = node.parentElement;
    return Boolean(parent
      && node.textContent?.trim()
      && !parent.closest('script, style, textarea, input, select, option, button, [contenteditable="true"], [data-lexync-saved="true"], #lexync-learning-mode, #lexync-ordinary-capture'));
  }

  function wordAtPoint(event: MouseEvent) {
    const documentWithCaret = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offset: number; offsetNode: Node } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
    const fallback = documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = position?.offsetNode ?? fallback?.startContainer;
    const offset = position?.offset ?? fallback?.startOffset;

    if (node?.nodeType !== Node.TEXT_NODE || offset === undefined) {
      return undefined;
    }

    const source = node.parentElement;

    if (!source || source.closest('[data-lexync-saved="true"], #lexync-learning-mode, #lexync-ordinary-capture')) {
      return undefined;
    }

    const text = node.textContent ?? '';

    for (const word of text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’\-‐][\p{L}\p{M}\p{N}]+)*/gu)) {
      const start = word.index;
      const end = start + word[0].length;

      if (offset >= start && offset <= end) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        return { expression: word[0], range, source };
      }
    }

    return undefined;
  }

  function markSavedExpressions() {
    const byExpression = [...entries]
      .sort((first, second) => second.expression.length - first.expression.length)
      .map((entry) => ({ entry, identity: entry.expression.normalize('NFKC').toLocaleLowerCase() }));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];

    while (walker.nextNode()) {
      if (eligibleTextNode(walker.currentNode)) {
        nodes.push(walker.currentNode as Text);
      }
    }

    for (const node of nodes) {
      const text = node.data;
      const identity = text.normalize('NFKC').toLocaleLowerCase();
      const matches: Array<{ end: number; entry: LearningModeEntry; start: number }> = [];

      for (const candidate of byExpression) {
        let start = identity.indexOf(candidate.identity);

        while (start >= 0) {
          const end = start + candidate.identity.length;
          const before = identity[start - 1] ?? '';
          const after = identity[end] ?? '';

          if (!/[\p{L}\p{M}\p{N}]/u.test(before) && !/[\p{L}\p{M}\p{N}]/u.test(after)
            && !matches.some((match) => start < match.end && end > match.start)) {
            matches.push({ end, entry: candidate.entry, start });
          }
          start = identity.indexOf(candidate.identity, end);
        }
      }

      if (matches.length === 0) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      let offset = 0;

      for (const match of matches.sort((first, second) => first.start - second.start)) {
        fragment.append(text.slice(offset, match.start));
        const mark = document.createElement('span');
        mark.dataset.lexyncSaved = 'true';
        mark.textContent = text.slice(match.start, match.end);
        mark.style.textDecoration = 'underline 2px';
        mark.style.textUnderlineOffset = '3px';
        mark.style.cursor = 'pointer';
        mark.addEventListener('mouseenter', () => showTranslationTooltip(match.entry, mark));
        mark.addEventListener('mouseleave', () => {
          translationTooltip.hidden = true;
        });
        mark.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showDetails(match.entry);
        });
        fragment.append(mark);
        offset = match.end;
      }
      fragment.append(text.slice(offset));
      node.replaceWith(fragment);
    }
  }

  function startMode(nextEntries: LearningModeEntry[]) {
    entries = nextEntries;
    modeEnabled = true;
    card.hidden = true;
    status.hidden = false;
    markSavedExpressions();
  }

  async function enable() {
    const learningLanguageId = languageSelect.value || response.selectedLearningLanguageId;

    if (!learningLanguageId) {
      languageLabel.hidden = false;
      languageSelect.focus();
      return;
    }

    await browser.runtime.sendMessage({
      enabled: true,
      origin: location.origin,
      learningLanguageId,
      type: 'learning-mode:set-site',
    });
    const next = await browser.runtime.sendMessage({
      origin: location.origin,
      textSample,
      type: 'learning-mode:load',
    }) as LearningModeLoadResponse;
    startMode(next.entries);
  }

  enableButton.addEventListener('click', () => void enable());
  declineButton.addEventListener('click', () => {
    void browser.runtime.sendMessage({
      enabled: false,
      origin: location.origin,
      learningLanguageId: languageSelect.value || response.selectedLearningLanguageId,
      type: 'learning-mode:set-site',
    });
    teardown();
  });
  status.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void browser.runtime.sendMessage({
      enabled: false,
      origin: location.origin,
      learningLanguageId: response.selectedLearningLanguageId,
      type: 'learning-mode:set-site',
    }).then(teardown);
  });

  document.addEventListener('mousemove', (event) => {
    if (!modeEnabled || event.composedPath().includes(host)) {
      return;
    }

    const hoveredWord = wordAtPoint(event);

    if (!hoveredWord) {
      hoverTimeout = window.setTimeout(clearHover, 120);
      return;
    }

    window.clearTimeout(hoverTimeout);

    if (hoverMark?.contains(hoveredWord.range.startContainer)) {
      return;
    }

    clearHover();
    const rect = hoveredWord.range.getBoundingClientRect();
    hoverMark = document.createElement('span');
    hoverMark.dataset.lexyncHover = 'true';
    hoveredWord.range.surroundContents(hoverMark);
    hoveredSource = hoveredWord.source;
    hoveredExpression = hoveredWord.expression;
    addHint.textContent = `Click to add "${hoveredWord.expression}"`;
    addHint.style.left = `${Math.min(rect.left, innerWidth - 180)}px`;
    addHint.style.top = `${Math.max(8, rect.top - 32)}px`;
    addHint.hidden = false;
  }, true);

  function clearHover() {
    const parent = hoverMark?.parentElement;
    hoverMark?.replaceWith(hoverMark.textContent ?? '');
    parent?.normalize();
    hoverMark = null;
    hoveredSource = null;
    hoveredExpression = '';
    addHint.hidden = true;
  }

  function isHoveredWordEvent(event: Event) {
    return Boolean(modeEnabled && hoverMark && event.composedPath().includes(hoverMark));
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isHoveredWordEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', (event) => {
    if (!isHoveredWordEvent(event) || !hoveredSource || !hoveredExpression) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const source = hoveredSource;
    const expression = hoveredExpression;
    const example = source.closest('p, li, blockquote, figcaption, td, th, div, article, section')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    clearHover();

    void browser.runtime.sendMessage({ type: 'learning-mode:start-capture' }).then(() => {
      scope.__lexyncOpenOrdinaryCapture?.(expression, example);
    });
  }, true);

  function teardown() {
    modeEnabled = false;
    clearHover();

    for (const mark of document.querySelectorAll<HTMLElement>('[data-lexync-saved="true"]')) {
      const parent = mark.parentElement;
      mark.replaceWith(mark.textContent ?? '');
      parent?.normalize();
    }

    host.remove();
    hoverStyle.remove();
    scope.__lexyncDeactivateOrdinaryCapture?.();
    scope.__lexyncLearningMode = false;
    browser.runtime.onMessage.removeListener(receiveLearningModeMessage);
  }

  function receiveLearningModeMessage(message: unknown) {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      return;
    }

    if (message.type === 'learning-mode:disable') {
      teardown();
    }

    if (message.type === 'learning-mode:index-updated' && 'entries' in message && Array.isArray(message.entries)) {
      entries = message.entries as LearningModeEntry[];
      markSavedExpressions();
    }
  }

  browser.runtime.onMessage.addListener(receiveLearningModeMessage);

  if (response.enabled) {
    startMode(response.entries);
  } else {
    proposal.textContent = `Learn ${languageName(response.detectedLearningLanguageTag)} on this site?`;
    languageSelect.replaceChildren();

    for (const language of response.learningLanguages) {
      const option = document.createElement('option');
      option.value = language.id;
      option.textContent = languageName(language.languageTag);
      option.selected = language.id === response.selectedLearningLanguageId;
      languageSelect.append(option);
    }

    languageLabel.hidden = Boolean(response.selectedLearningLanguageId);
    card.hidden = false;
  }
});
