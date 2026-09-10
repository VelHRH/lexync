import type {
  LoadClozemasterCaptureResponse,
  SaveClozemasterCaptureResponse,
} from '../lib/clozemaster-messages';
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

function controlledLessonMaterial(): LessonMaterial | undefined {
  const lesson = singleElement(document, '[data-lexync-clozemaster-lesson]');
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

function courseLanguages(): Pick<LessonMaterial, 'referenceLanguageTag' | 'targetLanguageTag'> | undefined {
  const exit = singleElement(document, 'a[title="Exit"][href^="/l/"]');
  const paths = [location.pathname, exit?.getAttribute('href')];

  for (const path of paths) {
    const match = path?.match(/^\/l\/([a-z]{2,3})-([a-z]{2,3})(?:\/|$)/i);

    if (match?.[1] && match[2]) {
      return {
        referenceLanguageTag: match[2],
        targetLanguageTag: match[1],
      };
    }
  }

  return undefined;
}

function liveLessonMaterial(): LessonMaterial | undefined {
  const lesson = singleElement(document, '.clozeable');
  const sentence = lesson && singleElement(lesson, '.sentence.answered');
  const expressionElement = sentence && singleElement(sentence, 'input[name="text_input_value"].correct');
  const translation = lesson && singleElement(lesson, '.translation')?.textContent?.trim();
  const leadingText = sentence && singleElement(sentence, ':scope > .pre')?.textContent;
  const trailingText = sentence && singleElement(sentence, ':scope > .post')?.textContent;
  const languages = courseLanguages();

  if (!(expressionElement instanceof HTMLInputElement)
    || !translation
    || leadingText === undefined
    || trailingText === undefined
    || !languages) {
    return undefined;
  }

  const expression = expressionElement.value.trim();
  const example = `${leadingText}${expression}${trailingText}`.replace(/\s+/g, ' ').trim();

  if (!expression || !example) {
    return undefined;
  }

  return {
    example,
    expression,
    referenceLanguageTag: languages.referenceLanguageTag,
    targetLanguageTag: languages.targetLanguageTag,
    translation,
  };
}

function lessonMaterial(): LessonMaterial | undefined {
  return controlledLessonMaterial() ?? liveLessonMaterial();
}

function materialKey(material: LessonMaterial): string {
  return JSON.stringify(material);
}

function lessonIdentity(): Element | undefined {
  const controlledLesson = singleElement(document, '[data-lexync-clozemaster-lesson]');

  if (controlledLesson) {
    return controlledLesson;
  }

  const liveLesson = singleElement(document, '.clozeable');
  return liveLesson && singleElement(liveLesson, '.sentence.answered');
}

export default defineContentScript({
  matches: ['*://*.clozemaster.com/*'],
  main(ctx) {
    const host = document.createElement('div');
    host.id = 'lexync-clozemaster-capture';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        ${shadowTokenCss}
        .capture {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: var(--lexync-z-injected);
          display: grid;
          gap: var(--lexync-space-2);
          max-width: min(360px, calc(100vw - 32px));
          padding: var(--lexync-space-3);
          border: 1px solid var(--lexync-color-border);
          border-radius: var(--lexync-radius-lg);
          background: var(--lexync-color-surface);
          box-shadow: var(--lexync-elevation-medium);
          color: var(--lexync-color-ink);
          font: var(--lexync-type-weight-semibold) var(--lexync-type-size-sm)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
        }
        button {
          min-height: 2.75rem;
          padding: var(--lexync-space-2) var(--lexync-space-4);
          border: 1px solid var(--lexync-color-brand-primary);
          border-radius: var(--lexync-radius-md);
          background: var(--lexync-color-brand-primary);
          color: var(--lexync-color-white);
          cursor: pointer;
          font: inherit;
        }
        button:focus-visible { outline: var(--lexync-focus-width) solid var(--lexync-focus-color); outline-offset: var(--lexync-focus-offset); }
        button:disabled { cursor: wait; opacity: 0.55; }
        button:active { transform: translateY(1px); }
        .sense-choice { display: grid; gap: var(--lexync-space-2); margin: 0; padding: 0; border: 0; font: inherit; }
        .sense-options { display: grid; gap: var(--lexync-space-2); }
        .sense-choice label { display: flex; gap: var(--lexync-space-2); align-items: flex-start; font-weight: var(--lexync-type-weight-regular); }
        [role="status"] { color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); }
        [role="status"]:empty { display: none; }
        [hidden] { display: none; }
      </style>
      <div class="capture">
        <button type="button">Add to Lexync</button>
        <fieldset class="sense-choice" hidden>
          <legend>Choose a Sense</legend>
          <div class="sense-options"></div>
          <label><input name="createNewSense" type="radio" value="new"> Create a new Sense</label>
        </fieldset>
        <span role="status"></span>
      </div>`;
    const button = root.querySelector('button');
    const senseChoice = root.querySelector<HTMLElement>('.sense-choice');
    const senseOptions = root.querySelector<HTMLElement>('.sense-options');
    const createNewSenseInput = root.querySelector<HTMLInputElement>('[name="createNewSense"]');
    const status = root.querySelector<HTMLElement>('[role="status"]');
    let displayedMaterialKey = '';
    let displayedLesson: Element | undefined;
    let generation = 0;
    let learningLanguageId = '';
    let senseId: string | undefined;
    let createNewSense = false;
    let switchNotice = '';

    const showSenseChoices = (response: Extract<SaveClozemasterCaptureResponse, { kind: 'needs_sense' }>) => {
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

    const syncCapture = () => {
      const material = lessonMaterial();

      if (!material) {
        displayedMaterialKey = '';
        displayedLesson = undefined;
        generation += 1;
        host.remove();
        return;
      }

      const nextMaterialKey = materialKey(material);
      const nextLesson = lessonIdentity();

      if (nextMaterialKey !== displayedMaterialKey || nextLesson !== displayedLesson) {
        displayedMaterialKey = nextMaterialKey;
        displayedLesson = nextLesson;
        generation += 1;
        learningLanguageId = '';
        senseId = undefined;
        createNewSense = false;
        switchNotice = '';

        if (button && status) {
          button.disabled = false;
          status.textContent = '';
        }
        if (senseChoice && senseOptions && createNewSenseInput) {
          senseChoice.hidden = true;
          senseOptions.replaceChildren();
          createNewSenseInput.checked = false;
        }
      }

      if (!host.isConnected) {
        document.documentElement.append(host);
      }
    };

    button?.addEventListener('click', () => {
      if (!button || !status) {
        return;
      }

      syncCapture();
      const currentMaterial = lessonMaterial();

      if (!currentMaterial) {
        status.textContent = 'Lesson material is unavailable.';
        return;
      }

      const savedGeneration = generation;
      const savedMaterialKey = materialKey(currentMaterial);
      button.disabled = true;
      status.textContent = 'Saving…';
      const loadResponsePromise = learningLanguageId
        ? Promise.resolve<LoadClozemasterCaptureResponse>({ learningLanguageId })
        : browser.runtime.sendMessage({
          answerLanguageTag: currentMaterial.referenceLanguageTag,
          learningLanguageTag: currentMaterial.targetLanguageTag,
          type: 'clozemaster-capture:load',
        }) as Promise<LoadClozemasterCaptureResponse>;
      void loadResponsePromise.then((loadResponse: LoadClozemasterCaptureResponse) => {
        if (!loadResponse.learningLanguageId || loadResponse.error) {
          return { error: loadResponse.error ?? 'Matching Learning Language is unavailable.' };
        }

        learningLanguageId = loadResponse.learningLanguageId;
        switchNotice = loadResponse.switched
          ? `Active Learning Language switched to ${loadResponse.learningLanguageTag ?? currentMaterial.targetLanguageTag}.`
          : '';
        status.textContent = `${switchNotice ? `${switchNotice} ` : ''}Saving…`;

        syncCapture();
        const latestMaterial = lessonMaterial();

        if (savedGeneration !== generation
          || !latestMaterial
          || materialKey(latestMaterial) !== savedMaterialKey) {
          return undefined;
        }

        return browser.runtime.sendMessage({
          example: currentMaterial.example,
          expression: currentMaterial.expression,
          answerLanguageTag: currentMaterial.referenceLanguageTag,
          createNewSense,
          learningLanguageId,
          senseId,
          translation: currentMaterial.translation,
          type: 'clozemaster-capture:save',
        }) as Promise<SaveClozemasterCaptureResponse>;
      }).then((response: SaveClozemasterCaptureResponse | undefined) => {
        if (!response || savedGeneration !== generation) {
          return;
        }

        if ('error' in response) {
          button.disabled = false;
          status.textContent = response.error;
          return;
        }

        if (response.kind === 'needs_sense') {
          showSenseChoices(response);
          return;
        }

        if (senseChoice) {
          senseChoice.hidden = true;
        }
        status.textContent = `${switchNotice ? `${switchNotice} ` : ''}Saved to Lexync.`;
      }).catch(() => {
        if (savedGeneration === generation) {
          button.disabled = false;
          status.textContent = 'Capture could not be completed.';
        }
      });
    });

    let syncPending = false;
    const scheduleSync = () => {
      if (syncPending) {
        return;
      }

      syncPending = true;
      ctx.requestAnimationFrame(() => {
        syncPending = false;
        syncCapture();
      });
    };
    const relevantSelector = '.stage, .clozeable, [data-lexync-clozemaster-lesson], a[title="Exit"][href^="/l/"]';
    const touchesCapture = (mutation: MutationRecord) => {
      const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;

      if (target?.closest(relevantSelector)) {
        return true;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        node instanceof Element
        && (node.matches(relevantSelector) || node.querySelector(relevantSelector)));
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(touchesCapture)) {
        scheduleSync();
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: ['class', 'href', 'value'],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    ctx.addEventListener(document, 'input', scheduleSync, true);
    ctx.addEventListener(window, 'wxt:locationchange', scheduleSync);
    ctx.onInvalidated(() => {
      observer.disconnect();
      host.remove();
    });
    syncCapture();
  },
});
