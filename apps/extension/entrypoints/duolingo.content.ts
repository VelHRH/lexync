import type {
  LoadDuolingoCaptureResponse,
  SaveDuolingoCaptureResponse,
} from '../lib/duolingo-messages';
import { shadowTokenCss } from '@lexync/design-system';

type LessonMaterial = {
  example: string | null;
  expression: string;
  referenceLanguageTag: string;
  targetLanguageTag: string;
  translation: string;
};

function singleElement(container: ParentNode, selector: string): Element | undefined {
  const elements = container.querySelectorAll(selector);
  return elements.length === 1 ? elements[0] : undefined;
}

function lessonMaterial(): LessonMaterial | undefined {
  const lesson = singleElement(document, '[data-lexync-duolingo-lesson]');
  const expression = lesson && singleElement(lesson, '[data-lexync-expression]')?.textContent?.trim();
  const translation = lesson && singleElement(lesson, '[data-lexync-translation]')?.textContent?.trim();
  const examples = lesson?.querySelectorAll('[data-lexync-example]');
  const targetLanguageTag = lesson?.getAttribute('data-lexync-target-language')?.trim();
  const referenceLanguageTag = lesson?.getAttribute('data-lexync-reference-language')?.trim();

  if (!lesson
    || !expression
    || !translation
    || !targetLanguageTag
    || !referenceLanguageTag
    || (examples?.length ?? 0) > 1) {
    return undefined;
  }

  return {
    example: examples?.[0]?.textContent?.trim() || null,
    expression,
    referenceLanguageTag,
    targetLanguageTag,
    translation,
  };
}

export default defineContentScript({
  matches: ['*://*.duolingo.com/*'],
  async main() {
    const material = lessonMaterial();

    if (!material) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'lexync-duolingo-capture';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        ${shadowTokenCss}
        * { box-sizing: border-box; }
        .capture {
          position: fixed;
          left: 50%;
          bottom: max(var(--lexync-space-4), env(safe-area-inset-bottom));
          z-index: var(--lexync-z-injected);
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--lexync-space-4);
          width: min(640px, calc(100vw - var(--lexync-space-6)));
          max-height: calc(100vh - var(--lexync-space-8));
          overflow: auto;
          padding: var(--lexync-space-3) var(--lexync-space-4);
          border: 1px solid var(--lexync-color-border);
          border-radius: var(--lexync-radius-lg);
          background: var(--lexync-color-surface);
          transform: translateX(-50%);
          color: var(--lexync-color-ink);
          font: var(--lexync-type-weight-semibold) var(--lexync-type-size-sm)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
        }
        .context-region { display: grid; min-width: 0; gap: var(--lexync-space-1); padding: var(--lexync-space-2) var(--lexync-space-3); border-radius: var(--lexync-radius-sm); background: var(--lexync-color-surface-subtle); }
        .context-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--lexync-space-3); }
        .kicker { margin: 0; color: var(--lexync-color-brand-primary); font-size: 0.6875rem; font-weight: var(--lexync-type-weight-bold); letter-spacing: 0.1em; text-transform: uppercase; }
        .context-detail { margin: 0; overflow: hidden; color: var(--lexync-color-ink); font-size: var(--lexync-type-size-sm); line-height: var(--lexync-type-line-normal); text-overflow: ellipsis; white-space: nowrap; }
        .context { margin: 0; overflow: hidden; color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); line-height: var(--lexync-type-line-normal); text-overflow: ellipsis; white-space: nowrap; }
        .mark { flex: 0 0 auto; color: var(--lexync-color-ink-muted); font: var(--lexync-type-weight-bold) 0.6875rem/var(--lexync-type-line-normal) var(--lexync-type-family-mono); }
        .action-region { display: grid; justify-items: end; gap: var(--lexync-space-1); min-width: max-content; }
        button {
          min-height: 2.75rem;
          padding: var(--lexync-space-2) var(--lexync-space-4);
          border: 1px solid var(--lexync-color-brand-primary);
          border-radius: var(--lexync-radius-sm);
          background: var(--lexync-color-brand-primary);
          color: var(--lexync-color-white);
          cursor: pointer;
          font: inherit;
        }
        button span { display: inline-flex; align-items: center; gap: var(--lexync-space-2); }
        .button-arrow { font-size: var(--lexync-type-size-lg); line-height: 1; }
        button:focus-visible { outline: var(--lexync-focus-width) solid var(--lexync-focus-color); outline-offset: var(--lexync-focus-offset); }
        button:disabled { cursor: wait; opacity: 0.55; }
        button:active { transform: translateY(1px); }
        .sense-choice { display: grid; grid-column: 1 / -1; gap: var(--lexync-space-2); margin: 0; padding: var(--lexync-space-3) 0 0; border: 0; border-top: 1px solid var(--lexync-color-border); font: inherit; }
        .sense-choice legend { padding: 0; font-size: var(--lexync-type-size-xs); font-weight: var(--lexync-type-weight-bold); }
        .sense-options { display: grid; gap: var(--lexync-space-2); }
        .sense-choice label { display: flex; gap: var(--lexync-space-2); align-items: flex-start; font-weight: var(--lexync-type-weight-regular); }
        [role="status"] { max-width: 20rem; color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); text-align: end; }
        [role="status"]:empty { display: none; }
        [hidden] { display: none; }
        @media (max-width: 520px) {
          .capture { left: var(--lexync-space-3); right: var(--lexync-space-3); bottom: max(var(--lexync-space-3), env(safe-area-inset-bottom)); grid-template-columns: 1fr; width: auto; transform: none; }
          .action-region { justify-items: stretch; min-width: 0; }
          button { width: 100%; }
          [role="status"] { max-width: none; text-align: start; }
          .sense-choice { grid-column: auto; }
        }
      </style>
      <div class="capture action-bar">
        <div class="context-region"><div class="context-heading"><p class="kicker">Lesson capture</p><span class="mark">LEXYNC</span></div><p class="context-detail"></p><p class="context">Save this answer to your Lexync library.</p></div>
        <div class="action-region"><button type="button"><span>Save to Lexync <span class="button-arrow" aria-hidden="true">→</span></span></button><span role="status"></span></div>
        <fieldset class="sense-choice" hidden>
          <legend>Choose a Sense</legend>
          <div class="sense-options"></div>
          <label><input name="createNewSense" type="radio" value="new"> Create a new Sense</label>
        </fieldset>
      </div>`;
    document.documentElement.append(host);
    const button = root.querySelector('button');
    const contextDetail = root.querySelector<HTMLElement>('.context-detail');
    const senseChoice = root.querySelector<HTMLElement>('.sense-choice');
    const senseOptions = root.querySelector<HTMLElement>('.sense-options');
    const createNewSenseInput = root.querySelector<HTMLInputElement>('[name="createNewSense"]');
    const status = root.querySelector<HTMLElement>('[role="status"]');
    let learningLanguageId = '';
    let senseId: string | undefined;
    let createNewSense = false;
    let switchNotice = '';

    if (contextDetail) {
      contextDetail.textContent = `${material.expression} · ${material.translation}`;
    }

    const showSenseChoices = (response: Extract<SaveDuolingoCaptureResponse, { kind: 'needs_sense' }>) => {
      if (!senseChoice || !senseOptions || !createNewSenseInput || !button || !status) {
        return;
      }

      senseId = undefined;
      createNewSense = false;
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
          button.disabled = false;
        });
        label.append(input, document.createTextNode(sense.translations.map((item) => `${item.text} (${item.answerLanguageTag})`).join(' · ') || 'Existing Sense'));
        senseOptions.append(label);
      }
      createNewSenseInput.checked = false;
      button.disabled = true;
      status.textContent = `${switchNotice ? `${switchNotice} ` : ''}Choose a Sense or create a new Sense before saving.`;
    };

    createNewSenseInput?.addEventListener('change', () => {
      createNewSense = createNewSenseInput.checked;
      senseId = undefined;
      if (button) {
        button.disabled = !createNewSenseInput.checked;
      }
    });

    button?.addEventListener('click', () => {
      if (!button || !status) {
        return;
      }

      button.disabled = true;
      status.textContent = 'Saving…';
      const loadResponsePromise = learningLanguageId
        ? Promise.resolve<LoadDuolingoCaptureResponse>({ learningLanguageId })
        : browser.runtime.sendMessage({
          answerLanguageTag: material.referenceLanguageTag,
          learningLanguageTag: material.targetLanguageTag,
          type: 'duolingo-capture:load',
        }) as Promise<LoadDuolingoCaptureResponse>;
      void loadResponsePromise.then((loadResponse: LoadDuolingoCaptureResponse) => {
        if (!loadResponse.learningLanguageId || loadResponse.error) {
          return { error: loadResponse.error ?? 'Matching Learning Language is unavailable.' };
        }

        learningLanguageId = loadResponse.learningLanguageId;
        switchNotice = loadResponse.switched
          ? `Active Learning Language switched to ${loadResponse.learningLanguageTag ?? material.targetLanguageTag}.`
          : '';
        status.textContent = `${switchNotice ? `${switchNotice} ` : ''}Saving…`;

        return browser.runtime.sendMessage({
          answerLanguageTag: material.referenceLanguageTag,
          createNewSense,
          example: material.example,
          expression: material.expression,
          learningLanguageId,
          senseId,
          translation: material.translation,
          type: 'duolingo-capture:save',
        }) as Promise<SaveDuolingoCaptureResponse>;
      }).then((response: SaveDuolingoCaptureResponse) => {
        if ('error' in response) {
          button.disabled = false;
          status.textContent = response.error;
          return;
        }

        if (response.kind === 'needs_sense') {
          showSenseChoices(response);
          return;
        }

        status.textContent = `${switchNotice ? `${switchNotice} ` : ''}Saved to Lexync.`;
      }).catch(() => {
        button.disabled = false;
        status.textContent = 'Capture could not be completed.';
      });
    });
  },
});
