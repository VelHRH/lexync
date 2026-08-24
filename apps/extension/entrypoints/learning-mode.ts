import { studyPairLabel } from '@lexync/domain';
import type { LearningModeEntry, LearningModeLoadResponse } from '../lib/learning-mode-messages';

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
  const response = await browser.runtime.sendMessage({
    detectedTargetLanguageTag: document.documentElement.lang,
    origin: location.origin,
    type: 'learning-mode:load',
  }) as LearningModeLoadResponse;

  if (!response.permitted || (response.decided && !response.enabled)) {
    scope.__lexyncLearningMode = false;
    return;
  }

  const host = document.createElement('div');
  host.id = 'lexync-learning-mode';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card, .details {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(340px, calc(100vw - 40px));
        padding: 18px;
        border: 1px solid rgba(25, 37, 30, .18);
        border-radius: 16px;
        background: #fbf8ef;
        box-shadow: 0 18px 55px rgba(25, 37, 30, .24);
        color: #19251e;
        font: 14px/1.45 Arial, Helvetica, sans-serif;
      }
      h2 { margin: 0 0 8px; font: 400 25px/1.1 Georgia, 'Times New Roman', serif; }
      p { margin: 0 0 14px; color: rgba(25, 37, 30, .7); }
      label { display: grid; gap: 6px; margin: 12px 0; font-size: 11px; font-weight: 700; }
      select { width: 100%; padding: 9px; border: 1px solid rgba(25, 37, 30, .18); border-radius: 8px; background: white; }
      .actions { display: flex; gap: 9px; }
      button { padding: 9px 13px; border: 0; border-radius: 999px; cursor: pointer; font: 700 13px Arial, sans-serif; }
      .primary { background: #19251e; color: #fbf8ef; }
      .secondary { background: #e5e7de; color: #19251e; }
      .mode-status {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483646;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(25, 37, 30, .9);
        color: #fbf8ef;
        font: 600 11px Arial, sans-serif;
      }
      .add {
        position: fixed;
        z-index: 2147483647;
        padding: 5px 9px;
        background: #526c48;
        color: white;
        box-shadow: 0 7px 20px rgba(25, 37, 30, .22);
      }
      .details { right: 20px; bottom: 58px; }
      .sense { padding: 10px 0; border-top: 1px solid rgba(25, 37, 30, .12); }
      .sense strong, .sense span { display: block; }
      [hidden] { display: none !important; }
    </style>
    <section class="card" role="dialog" aria-labelledby="lexync-learning-heading" hidden>
      <h2 id="lexync-learning-heading">Learning Mode</h2>
      <p class="proposal"></p>
      <label hidden>Study Pair<select></select></label>
      <div class="actions"><button class="primary enable">Enable</button><button class="secondary decline">Not now</button></div>
    </section>
    <div class="mode-status" role="status" hidden>Learning Mode is on</div>
    <button class="add" hidden></button>
    <section class="details" role="dialog" aria-label="Saved expression" hidden></section>
  `;
  document.documentElement.append(host);
  const hoverStyle = document.createElement('style');
  hoverStyle.textContent = '[data-lexync-hover="true"] { text-decoration: underline 1px rgba(82, 108, 72, .25) !important; text-underline-offset: 3px; }';
  document.documentElement.append(hoverStyle);
  const card = root.querySelector<HTMLElement>('.card')!;
  const proposal = root.querySelector<HTMLElement>('.proposal')!;
  const pairLabel = root.querySelector<HTMLLabelElement>('label')!;
  const pairSelect = root.querySelector<HTMLSelectElement>('select')!;
  const enableButton = root.querySelector<HTMLButtonElement>('.enable')!;
  const declineButton = root.querySelector<HTMLButtonElement>('.decline')!;
  const status = root.querySelector<HTMLElement>('.mode-status')!;
  const addButton = root.querySelector<HTMLButtonElement>('.add')!;
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
    const senses = entry.senses.map((sense) => `
      <div class="sense">
        ${sense.translations.map((translation) => `<strong>${escapeMarkup(translation)}</strong>`).join('')}
        ${sense.examples.map((example) => `<span>${escapeMarkup(example)}</span>`).join('')}
      </div>
    `).join('');
    details.innerHTML = `<h2>${escapeMarkup(entry.expression)}</h2>${senses}<button class="secondary">Close</button>`;
    details.hidden = false;
    details.querySelector('button')?.addEventListener('click', () => {
      details.hidden = true;
    });
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
      && !parent.closest('script, style, textarea, input, select, option, button, [contenteditable="true"], #lexync-learning-mode, #lexync-ordinary-capture'));
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
        mark.style.textDecoration = 'underline 2px rgba(82, 108, 72, .85)';
        mark.style.textUnderlineOffset = '3px';
        mark.style.cursor = 'pointer';
        mark.addEventListener('click', () => showDetails(match.entry));
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
    const studyPairId = pairSelect.value || response.selectedStudyPairId;

    if (!studyPairId) {
      pairLabel.hidden = false;
      pairSelect.focus();
      return;
    }

    await browser.runtime.sendMessage({
      enabled: true,
      origin: location.origin,
      studyPairId,
      type: 'learning-mode:set-site',
    });
    const next = await browser.runtime.sendMessage({
      detectedTargetLanguageTag: document.documentElement.lang,
      origin: location.origin,
      type: 'learning-mode:load',
    }) as LearningModeLoadResponse;
    startMode(next.entries);
  }

  enableButton.addEventListener('click', () => void enable());
  declineButton.addEventListener('click', () => {
    void browser.runtime.sendMessage({
      enabled: false,
      origin: location.origin,
      studyPairId: pairSelect.value || response.selectedStudyPairId,
      type: 'learning-mode:set-site',
    });
    teardown();
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
    addButton.textContent = `Add ${hoveredWord.expression}`;
    addButton.setAttribute('aria-label', `Add ${hoveredWord.expression}`);
    addButton.style.left = `${Math.min(rect.left, innerWidth - 130)}px`;
    addButton.style.top = `${Math.max(8, rect.top - 32)}px`;
    addButton.hidden = false;
  }, true);

  function clearHover() {
    const parent = hoverMark?.parentElement;
    hoverMark?.replaceWith(hoverMark.textContent ?? '');
    parent?.normalize();
    hoverMark = null;
    hoveredSource = null;
    hoveredExpression = '';
    addButton.hidden = true;
  }

  addButton.addEventListener('mouseenter', () => window.clearTimeout(hoverTimeout));
  addButton.addEventListener('mouseleave', clearHover);

  addButton.addEventListener('click', async () => {
    if (!hoveredSource || !hoveredExpression) {
      return;
    }

    const example = hoveredSource.closest('p, li, blockquote, figcaption, td, th, div, article, section')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    await browser.runtime.sendMessage({ type: 'learning-mode:start-capture' });
    scope.__lexyncOpenOrdinaryCapture?.(hoveredExpression, example);
    clearHover();
  });

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
  }

  browser.runtime.onMessage.addListener((message) => {
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'learning-mode:disable') {
      teardown();
    }
  });

  if (response.enabled) {
    startMode(response.entries);
  } else {
    proposal.textContent = `Learn ${languageName(response.detectedTargetLanguageTag)} on this site?`;
    pairSelect.replaceChildren();

    for (const pair of response.pairs) {
      const option = document.createElement('option');
      option.value = pair.id;
      option.textContent = studyPairLabel(pair);
      option.selected = pair.id === response.selectedStudyPairId;
      pairSelect.append(option);
    }

    pairLabel.hidden = Boolean(response.selectedStudyPairId);
    card.hidden = false;
  }
});
