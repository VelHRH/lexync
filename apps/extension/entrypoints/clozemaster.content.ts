import type {
  LoadClozemasterCaptureResponse,
  SaveClozemasterCaptureResponse,
} from '../lib/clozemaster-messages';

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
  const pre = sentence && singleElement(sentence, ':scope > .pre')?.textContent;
  const post = sentence && singleElement(sentence, ':scope > .post')?.textContent;
  const languages = courseLanguages();

  if (!(expressionElement instanceof HTMLInputElement)
    || !translation
    || pre === undefined
    || post === undefined
    || !languages) {
    return undefined;
  }

  const expression = expressionElement.value.trim();
  const example = `${pre}${expression}${post}`.replace(/\s+/g, ' ').trim();

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

export default defineContentScript({
  matches: ['*://*.clozemaster.com/*'],
  main(ctx) {
    const host = document.createElement('div');
    host.id = 'lexync-clozemaster-capture';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .capture {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483647;
          display: grid;
          gap: 8px;
          padding: 12px;
          border: 1px solid rgba(25, 37, 30, 0.18);
          border-radius: 16px;
          background: #fbf8ef;
          box-shadow: 0 12px 35px rgba(25, 37, 30, 0.22);
          color: #19251e;
          font: 600 13px/1.4 Arial, Helvetica, sans-serif;
        }
        button {
          min-height: 44px;
          padding: 10px 16px;
          border: 0;
          border-radius: 999px;
          background: #19251e;
          color: #fbf8ef;
          cursor: pointer;
          font: inherit;
        }
        button:disabled { cursor: default; opacity: 0.7; }
        [role="status"]:empty { display: none; }
      </style>
      <div class="capture">
        <button type="button">Add to Lexync</button>
        <span role="status"></span>
      </div>`;
    const button = root.querySelector('button');
    const status = root.querySelector<HTMLElement>('[role="status"]');
    let displayedMaterialKey = '';
    let generation = 0;

    const syncCapture = () => {
      const material = lessonMaterial();

      if (!material) {
        displayedMaterialKey = '';
        generation += 1;
        host.remove();
        return;
      }

      const nextMaterialKey = materialKey(material);

      if (nextMaterialKey !== displayedMaterialKey) {
        displayedMaterialKey = nextMaterialKey;
        generation += 1;

        if (button && status) {
          button.disabled = false;
          status.textContent = '';
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
      button.disabled = true;
      status.textContent = 'Saving…';
      void browser.runtime.sendMessage({
        referenceLanguageTag: currentMaterial.referenceLanguageTag,
        targetLanguageTag: currentMaterial.targetLanguageTag,
        type: 'clozemaster-capture:load',
      }).then((loadResponse: LoadClozemasterCaptureResponse) => {
        if (!loadResponse.studyPairId || loadResponse.error) {
          return loadResponse;
        }

        return browser.runtime.sendMessage({
          example: currentMaterial.example,
          expression: currentMaterial.expression,
          studyPairId: loadResponse.studyPairId,
          translation: currentMaterial.translation,
          type: 'clozemaster-capture:save',
        }) as Promise<SaveClozemasterCaptureResponse>;
      }).then((response: SaveClozemasterCaptureResponse) => {
        if (savedGeneration !== generation) {
          return;
        }

        if (response.error) {
          button.disabled = false;
          status.textContent = response.error;
          return;
        }

        status.textContent = 'Saved to Lexync.';
      }).catch(() => {
        if (savedGeneration === generation) {
          button.disabled = false;
          status.textContent = 'Capture could not be completed.';
        }
      });
    });

    const observer = new MutationObserver(syncCapture);
    observer.observe(document.documentElement, {
      attributeFilter: ['class', 'href', 'value'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    ctx.addEventListener(window, 'wxt:locationchange', syncCapture);
    ctx.onInvalidated(() => {
      observer.disconnect();
      host.remove();
    });
    syncCapture();
  },
});
