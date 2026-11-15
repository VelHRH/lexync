'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { LibraryEntry } from '../lib/libraryStore';
import { VocabularyAudioClipRecorder } from './VocabularyAudioClip';

type DraftItem = { id: string | null; key: string; text: string };
type DraftExampleTranslation = { id: string | null; key: string; text: string; answerLanguageTag: string | null };
type DraftExample = DraftItem & { translations: DraftExampleTranslation[] };
export type DraftSense = { id: string | null; key: string; translations: DraftItem[]; examples: DraftExample[] };
export type EntryDraft = { id: string; expression: string; senses: DraftSense[] };

function draftKey() {
  return crypto.randomUUID();
}

export function toDraft(entry: LibraryEntry): EntryDraft {
  return {
    id: entry.id,
    expression: entry.expression,
    senses: entry.senses.map((sense) => ({
      id: sense.id,
      key: sense.id,
      translations: sense.translations.map((translation) => ({ ...translation, key: translation.id })),
      examples: sense.examples.map((example) => ({ ...example, key: example.id, translations: example.translations.map((translation) => ({ ...translation, key: translation.id, answerLanguageTag: translation.answer_language_tag })) })),
    })),
  };
}

export function VocabularyEntryEditor({ entry, draft, setDraft, saving, notice, online, offlineReason, onSubmit, onCancel, onClipChanged }: {
  entry: LibraryEntry;
  draft: EntryDraft;
  setDraft: Dispatch<SetStateAction<EntryDraft | null>>;
  saving: boolean;
  notice: string;
  online: boolean;
  offlineReason: string | undefined;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onClipChanged: () => void;
}) {
  const draftExamples = draft.senses.flatMap((sense) => sense.examples);

  function updateSense(index: number, update: (sense: DraftSense) => DraftSense) {
    setDraft((current) => current && ({ ...current, senses: current.senses.map((sense, senseIndex) => senseIndex === index ? update(sense) : sense) }));
  }

  function updateTranslationText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: sense.translations.map((item) => item.key === key ? { ...item, text } : item) }));
  }

  function addTranslation(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: [...sense.translations, { id: null, key: draftKey(), text: '' }] }));
  }

  function removeTranslation(senseIndex: number, key: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: sense.translations.filter((item) => item.key !== key) }));
  }

  function updateExampleText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: sense.examples.map((item) => item.key === key ? { ...item, text } : item) }));
  }

  function updateExampleTranslationText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({
      ...sense,
      examples: sense.examples.map((item) => item.key !== key ? item : {
        ...item,
        translations: item.translations.length
          ? item.translations.map((translation, index) => index === 0 ? { ...translation, text } : translation)
          : [{ id: null, key: draftKey(), text, answerLanguageTag: null }],
      }),
    }));
  }

  function addExample(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: [...sense.examples, { id: null, key: draftKey(), text: '', translations: [] }] }));
  }

  function removeExample(senseIndex: number, key: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: sense.examples.filter((item) => item.key !== key) }));
  }

  function moveExample(exampleKey: string, senseKey: string) {
    setDraft((current) => {
      if (!current) return current;
      const moved = current.senses.flatMap((sense) => sense.examples).find((item) => item.key === exampleKey);
      if (!moved) return current;
      return {
        ...current,
        senses: current.senses.map((sense) => ({
          ...sense,
          examples: sense.key === senseKey
            ? [...sense.examples.filter((item) => item.key !== exampleKey), moved]
            : sense.examples.filter((item) => item.key !== exampleKey),
        })),
      };
    });
  }

  return (
    <form className="vocabulary-editor" onSubmit={onSubmit}>
      <div className="field vocabulary-editor-expression">
        <label htmlFor={`edit-expression-${entry.id}`}>Expression</label>
        <input id={`edit-expression-${entry.id}`} value={draft.expression} disabled={!online} onChange={(event) => setDraft({ ...draft, expression: event.target.value })} />
      </div>
      {draft.senses.map((sense, senseIndex) => <section className="vocabulary-sense-editor" key={sense.key} role="group" aria-labelledby={`sense-heading-${sense.key}`}>
        <div className="vocabulary-editor-head">
          <h4 className="surface-meta" id={`sense-heading-${sense.key}`}>Sense {senseIndex + 1}</h4>
          <button className="inline-button danger" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Remove Sense ${senseIndex + 1}`} onClick={() => setDraft({ ...draft, senses: draft.senses.filter((item) => item.key !== sense.key) })}>Remove</button>
        </div>
        {sense.translations.map((item, translationIndex) => <div className="vocabulary-editor-row" key={item.key}>
          <div className="field">
            <label htmlFor={`translation-${item.key}`}>Sense {senseIndex + 1} translation {translationIndex + 1}</label>
            <input id={`translation-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateTranslationText(senseIndex, item.key, event.target.value)} />
          </div>
          <button className="icon-button" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Remove translation ${translationIndex + 1} from Sense ${senseIndex + 1}`} onClick={() => removeTranslation(senseIndex, item.key)}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>)}
        <button className="inline-button" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Add translation to Sense ${senseIndex + 1}`} onClick={() => addTranslation(senseIndex)}>Add translation</button>
        {sense.examples.map((item) => {
          const exampleIndex = draftExamples.findIndex((exampleItem) => exampleItem.key === item.key);
          return <div className="vocabulary-example-editor" key={item.key} role="group" aria-label={`Example ${exampleIndex + 1}`}>
            <button className="icon-button vocabulary-example-remove" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Remove Example ${exampleIndex + 1}`} onClick={() => removeExample(senseIndex, item.key)}>
              <span aria-hidden="true">✕</span>
            </button>
            <div className="vocabulary-example-fields">
              <div className="field">
                <label htmlFor={`example-text-${item.key}`}>Example {exampleIndex + 1} text</label>
                <textarea id={`example-text-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateExampleText(senseIndex, item.key, event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`example-translation-${item.key}`}>Example {exampleIndex + 1} translation</label>
                <textarea id={`example-translation-${item.key}`} value={item.translations[0]?.text ?? ''} disabled={!online} onChange={(event) => updateExampleTranslationText(senseIndex, item.key, event.target.value)} />
              </div>
            </div>
            <div className="field vocabulary-example-sense">
              <label htmlFor={`example-sense-${item.key}`}>Example {exampleIndex + 1} Sense</label>
              <select id={`example-sense-${item.key}`} value={sense.key} disabled={!online} onChange={(event) => moveExample(item.key, event.target.value)}>
                {draft.senses.map((option, optionIndex) => <option key={option.key} value={option.key}>Sense {optionIndex + 1} · {option.translations[0]?.text || 'New Sense'}</option>)}
              </select>
            </div>
          </div>;
        })}
        <button className="inline-button" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Add Example to Sense ${senseIndex + 1}`} onClick={() => addExample(senseIndex)}>Add Example</button>
      </section>)}
      <button className="secondary-button vocabulary-add-sense" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => setDraft({ ...draft, senses: [...draft.senses, { id: null, key: draftKey(), translations: [{ id: null, key: draftKey(), text: '' }], examples: [] }] })}>Add Sense</button>
      <VocabularyAudioClipRecorder entry={entry} online={online} onChanged={onClipChanged} />
      {notice && <p className="form-notice error" role="alert">{notice}</p>}
      <div className="vocabulary-editor-actions">
        <button className="primary-button" type="submit" disabled={saving || !online} aria-describedby={offlineReason}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
