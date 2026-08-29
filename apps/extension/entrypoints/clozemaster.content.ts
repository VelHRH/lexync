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

function lessonMaterial(): LessonMaterial | undefined {
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

export default defineContentScript({
  matches: ['*://*.clozemaster.com/*'],
  async main() {
    const material = lessonMaterial();

    if (!material) {
      return;
    }

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
        <button type="button">Save to Lexync</button>
        <span role="status"></span>
      </div>`;
    document.documentElement.append(host);
    const button = root.querySelector('button');
    const status = root.querySelector<HTMLElement>('[role="status"]');

    button?.addEventListener('click', () => {
      if (!button || !status) {
        return;
      }

      const currentMaterial = lessonMaterial();

      if (!currentMaterial) {
        status.textContent = 'Lesson material is unavailable.';
        return;
      }

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
        if (response.error) {
          button.disabled = false;
          status.textContent = response.error;
          return;
        }

        status.textContent = 'Saved to Lexync.';
      });
    });
  },
});
