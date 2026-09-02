'use client';

import { canonicalLanguageTag, languageName, type StudyPair } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

type Translation = { answer_language_tag: string; id: string; text: string };
type Example = { id: string; text: string };
type Sense = { id: string; translations: Translation[]; examples: Example[] };
type LibraryEntry = { id: string; expression: string; senses: Sense[]; suspended: boolean };
type LearningLanguage = { id: string; languageTag: string };
type PendingSense = { id: string; translations: Translation[] };
type VocabularyStatus = 'active' | 'all' | 'suspended';
type DraftItem = { id: string | null; key: string; text: string };
type DraftSense = { id: string | null; key: string; translations: DraftItem[]; examples: DraftItem[] };
type EntryDraft = { id: string; expression: string; senses: DraftSense[] };

function draftKey() {
  return crypto.randomUUID();
}

function toDraft(entry: LibraryEntry): EntryDraft {
  return {
    id: entry.id,
    expression: entry.expression,
    senses: entry.senses.map((sense) => ({
      id: sense.id,
      key: sense.id,
      translations: sense.translations.map((translation) => ({ ...translation, key: translation.id })),
      examples: sense.examples.map((example) => ({ ...example, key: example.id })),
    })),
  };
}

export function VocabularyLibrary({ onEntriesChanged, language, pairs }: { onEntriesChanged: () => Promise<void>; language: LearningLanguage; pairs: Array<StudyPair & { learningLanguageId: string }> }) {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expression, setExpression] = useState('');
  const [translation, setTranslation] = useState('');
  const [answerLanguage, setAnswerLanguage] = useState('');
  const [example, setExample] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VocabularyStatus>('all');
  const [suspensionNotice, setSuspensionNotice] = useState('');
  const [pendingSenses, setPendingSenses] = useState<PendingSense[]>([]);
  const online = useOnlineStatus();

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const pairIds = pairs.filter((pair) => pair.learningLanguageId === language.id).map((pair) => pair.id);
    if (!pairIds.length) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('vocabulary_entries').select('id,expression,suspended,study_pair_id').in('study_pair_id', pairIds).order('created_at');
    if (error) {
      setNotice(error.message);
      setLoading(false);
      return;
    }
    const entryIds = (data ?? []).map((entry) => entry.id);
    const { data: senses, error: sensesError } = entryIds.length
      ? await supabase.from('senses').select('id,vocabulary_entry_id').in('vocabulary_entry_id', entryIds).order('created_at')
      : { data: [], error: null };
    if (sensesError) {
      setNotice(sensesError.message);
      setLoading(false);
      return;
    }
    const senseIds = (senses ?? []).map((sense) => sense.id);
    const [{ data: translations, error: translationsError }, { data: examples, error: examplesError }] = senseIds.length
      ? await Promise.all([
        supabase.from('translations').select('id,sense_id,text,answer_language_tag').in('sense_id', senseIds).order('created_at'),
        supabase.from('examples').select('id,sense_id,text').in('sense_id', senseIds).order('created_at'),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (translationsError || examplesError) {
      setNotice(translationsError?.message ?? examplesError?.message ?? 'Vocabulary details could not be loaded.');
      setLoading(false);
      return;
    }
    const merged = new Map<string, LibraryEntry>();
    for (const entry of data ?? []) {
      const key = entry.expression.normalize('NFC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase();
      const nextSenses = (senses ?? []).filter((sense) => sense.vocabulary_entry_id === entry.id).map((sense) => ({
        id: sense.id,
        translations: (translations ?? []).filter((item) => item.sense_id === sense.id),
        examples: (examples ?? []).filter((item) => item.sense_id === sense.id),
      }));
      const existing = merged.get(key);
      if (existing) {
        existing.senses = [...existing.senses, ...nextSenses];
        existing.suspended = existing.suspended && entry.suspended;
      } else {
        merged.set(key, { id: entry.id, expression: entry.expression.trim(), suspended: entry.suspended, senses: nextSenses });
      }
    }
    setEntries([...merged.values()]);
    setLoading(false);
  }, [language.id, pairs]);

  useEffect(() => {
    queueMicrotask(() => void loadEntries());
    queueMicrotask(() => {
      if (searchParams.get('add') === '1') {
        setShowForm(true);
        window.history.replaceState(null, '', '/library');
      }
    });
  }, [loadEntries, searchParams]);

  async function capture(senseId: string | null = null, createNewSense = false) {
    setNotice('');
    const answerTag = canonicalLanguageTag(answerLanguage);
    const missing = [!expression.trim() ? 'Expression is required.' : '', !answerTag ? 'Enter a valid BCP 47 Answer Language tag.' : '', !translation.trim() ? 'Translation is required.' : ''].filter(Boolean);
    if (missing.length) {
      setNotice(missing.join(' '));
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('capture_learning_language_entry', {
      p_example: example,
      p_expression: expression,
      p_translation: translation,
      p_answer_language_tag: answerTag,
      p_learning_language_id: language.id,
      p_sense_id: senseId,
      p_create_new_sense: createNewSense,
    });
    setSaving(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (data?.kind === 'needs_sense') {
      setPendingSenses(data.senses ?? []);
      return;
    }
    setExpression('');
    setAnswerLanguage('');
    setTranslation('');
    setExample('');
    setPendingSenses([]);
    setShowForm(false);
    await loadEntries();
    await onEntriesChanged();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await capture();
  }

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

  function addExample(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: [...sense.examples, { id: null, key: draftKey(), text: '' }] }));
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

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setNotice('');
    if (!draft.expression.trim()) {
      setNotice('Expression is required.');
      return;
    }
    if (!draft.senses.length) {
      setNotice('A Vocabulary Entry needs at least one Sense.');
      return;
    }
    if (draft.senses.some((sense) => !sense.translations.length)) {
      setNotice('Each Sense needs at least one translation.');
      return;
    }
    if (draft.senses.some((sense) => sense.translations.some((item) => !item.text.trim()))) {
      setNotice('Translation is required.');
      return;
    }
    const hasDuplicateTranslation = draft.senses.some((sense) => {
      const identities = sense.translations.map((item) => item.text.normalize('NFC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase());
      return new Set(identities).size !== identities.length;
    });
    if (hasDuplicateTranslation) {
      setNotice('Translations in a Sense must be distinct.');
      return;
    }
    if (draft.senses.some((sense) => sense.examples.some((item) => !item.text.trim()))) {
      setNotice('Example text is required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_vocabulary_entry', {
      p_expression: draft.expression,
      p_senses: draft.senses.map((sense) => ({
        id: sense.id,
        translations: sense.translations.map(({ id, text }) => ({ id, text })),
        examples: sense.examples.map(({ id, text }) => ({ id, text })),
      })),
      p_vocabulary_entry_id: draft.id,
    });
    setSaving(false);
    if (error) {
      setNotice(`Changes could not be saved. ${error.message}`);
      return;
    }
    setDraft(null);
    await loadEntries();
  }

  async function deleteEntry(entry: LibraryEntry) {
    const confirmed = window.confirm(`Delete ${entry.expression}? Senses, translations, Examples, and learning progress owned by this Vocabulary Entry will also be removed. This cannot be undone.`);
    if (!confirmed) return;
    setNotice('');
    const { error } = await supabase.rpc('delete_vocabulary_entry', { p_vocabulary_entry_id: entry.id });
    if (error) {
      setNotice(`Vocabulary Entry could not be deleted. ${error.message}`);
      return;
    }
    setDraft(null);
    await loadEntries();
    await onEntriesChanged();
  }

  async function setSuspended(entry: LibraryEntry, suspended: boolean) {
    setNotice('');
    setSuspensionNotice('');
    const { error } = await supabase.rpc('set_vocabulary_entry_suspended', {
      p_suspended: suspended,
      p_vocabulary_entry_id: entry.id,
    });
    if (error) {
      setNotice(`${entry.expression} could not be ${suspended ? 'suspended' : 'resumed'}. ${error.message}`);
      return;
    }
    setEntries((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, suspended } : candidate));
    setSuspensionNotice(`${entry.expression} is ${suspended ? 'suspended' : 'active'}.`);
  }

  const draftExamples = draft?.senses.flatMap((sense) => sense.examples) ?? [];
  const normalizedQuery = query.normalize('NFC').trim().toLocaleLowerCase();
  const visibleEntries = entries.filter((entry) => {
    const matchesStatus = status === 'all' || (status === 'suspended' ? entry.suspended : !entry.suspended);
    const searchableText = [entry.expression, ...entry.senses.flatMap((sense) => sense.translations.map((item) => item.text))]
      .join('\n')
      .normalize('NFC')
      .toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
  const noResultsMessage = normalizedQuery
    ? `No ${status === 'all' ? '' : `${status} `}Vocabulary Entries match “${query.trim()}”.`
    : status === 'all' && entries.length === 0
      ? 'No vocabulary entries yet. Add your first one.'
      : `No ${status} Vocabulary Entries yet.`;

  return (
    <section className="vocabulary-library" aria-labelledby="library-heading">
      <div className="library-toolbar">
        <div>
          <p className="eyebrow"><span /> {languageName(language.languageTag)}</p>
          <h2 id="library-heading">Vocabulary Library</h2>
        </div>
        <button className="primary-button" type="button" disabled={!online} onClick={() => { setNotice(''); setDraft(null); setShowForm(true); }}>Add vocabulary</button>
      </div>
      {!online && <p className="form-notice" role="status">You are offline. Vocabulary changes require a connection.</p>}
      <div className="vocabulary-discovery-controls">
        <label htmlFor="vocabulary-search">Search vocabulary</label>
        <input id="vocabulary-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label htmlFor="vocabulary-status">Vocabulary status</label>
        <select id="vocabulary-status" value={status} onChange={(event) => setStatus(event.target.value as VocabularyStatus)}>
          <option value="all">All entries</option>
          <option value="active">Active entries</option>
          <option value="suspended">Suspended entries</option>
        </select>
      </div>
      {showForm && <form className="web-auth-form vocabulary-form" onSubmit={save}>
        <label htmlFor="expression">Expression</label>
        <input id="expression" value={expression} disabled={!online} onChange={(event) => setExpression(event.target.value)} />
        <label htmlFor="answer-language">Answer Language</label>
        <input id="answer-language" value={answerLanguage} disabled={!online} onChange={(event) => setAnswerLanguage(event.target.value)} placeholder="en or pt-BR" />
        <label htmlFor="translation">Translation</label>
        <input id="translation" value={translation} disabled={!online} onChange={(event) => setTranslation(event.target.value)} />
        <label htmlFor="example">Example <span>(optional)</span></label>
        <textarea id="example" value={example} disabled={!online} onChange={(event) => setExample(event.target.value)} />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Save Vocabulary Entry'}</button>
        {pendingSenses.length > 0 && <fieldset aria-labelledby="sense-choice-heading">
          <legend id="sense-choice-heading">Choose an existing Sense or create a new Sense</legend>
          {pendingSenses.map((sense, index) => <button className="secondary-button" key={sense.id} type="button" disabled={saving || !online} onClick={() => void capture(sense.id)}>
            Choose existing Sense {index + 1}: {sense.translations.map((item) => `${item.text} (${item.answer_language_tag})`).join(', ') || 'No translations'}
          </button>)}
          <button className="secondary-button" type="button" disabled={saving || !online} onClick={() => void capture(null, true)}>Create a new Sense</button>
        </fieldset>}
      </form>}
      {loading && <p className="app-empty">Loading your vocabulary…</p>}
      {!loading && visibleEntries.length === 0 && <p className="app-empty" role="status">{noResultsMessage}</p>}
      {suspensionNotice && <p className="form-notice" role="status">{suspensionNotice}</p>}
      {notice && !showForm && !draft && <p className="form-notice error" role="alert">{notice}</p>}
      <div className="vocabulary-entry-list">
        {visibleEntries.map((entry) => <article className={`vocabulary-entry-item${entry.suspended ? ' suspended' : ''}`} key={entry.id}>
          <details className="vocabulary-entry" open={draft?.id === entry.id || undefined}>
            <summary><span>{entry.expression}</span>{entry.suspended && <span className="vocabulary-status-badge">Suspended</span>}</summary>
            <div>
            {draft?.id === entry.id ? <form className="vocabulary-editor" onSubmit={saveDraft}>
              <label htmlFor={`edit-expression-${entry.id}`}>Expression</label>
              <input id={`edit-expression-${entry.id}`} value={draft.expression} disabled={!online} onChange={(event) => setDraft({ ...draft, expression: event.target.value })} />
              {draft.senses.map((sense, senseIndex) => <fieldset key={sense.key}>
                <legend>Sense {senseIndex + 1}</legend>
                {sense.translations.map((item, translationIndex) => <div className="vocabulary-editor-row" key={item.key}>
                  <label htmlFor={`translation-${item.key}`}>Sense {senseIndex + 1} translation {translationIndex + 1}</label>
                  <input id={`translation-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateTranslationText(senseIndex, item.key, event.target.value)} />
                  <button className="text-button danger" type="button" disabled={!online} aria-label={`Remove translation ${translationIndex + 1} from Sense ${senseIndex + 1}`} onClick={() => removeTranslation(senseIndex, item.key)}>Remove</button>
                </div>)}
                <button className="text-button" type="button" disabled={!online} onClick={() => addTranslation(senseIndex)}>Add translation to Sense {senseIndex + 1}</button>
                {sense.examples.map((item) => {
                  const exampleIndex = draftExamples.findIndex((exampleItem) => exampleItem.key === item.key);
                  return <div className="vocabulary-example-editor" key={item.key}>
                    <label htmlFor={`example-text-${item.key}`}>Example {exampleIndex + 1} text</label>
                    <textarea id={`example-text-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateExampleText(senseIndex, item.key, event.target.value)} />
                    <label htmlFor={`example-sense-${item.key}`}>Example {exampleIndex + 1} Sense</label>
                    <select id={`example-sense-${item.key}`} value={sense.key} disabled={!online} onChange={(event) => moveExample(item.key, event.target.value)}>
                      {draft.senses.map((option, optionIndex) => <option key={option.key} value={option.key}>Sense {optionIndex + 1} · {option.translations[0]?.text || 'New Sense'}</option>)}
                    </select>
                    <button className="text-button danger" type="button" disabled={!online} onClick={() => removeExample(senseIndex, item.key)}>Remove Example {exampleIndex + 1}</button>
                  </div>;
                })}
                <button className="text-button" type="button" disabled={!online} onClick={() => addExample(senseIndex)}>Add Example to Sense {senseIndex + 1}</button>
                <button className="text-button danger" type="button" disabled={!online} onClick={() => setDraft({ ...draft, senses: draft.senses.filter((item) => item.key !== sense.key) })}>Remove Sense {senseIndex + 1}</button>
              </fieldset>)}
              <button className="secondary-button" type="button" disabled={!online} onClick={() => setDraft({ ...draft, senses: [...draft.senses, { id: null, key: draftKey(), translations: [{ id: null, key: draftKey(), text: '' }], examples: [] }] })}>Add Sense</button>
              {notice && <p className="form-notice error" role="alert">{notice}</p>}
              <div className="vocabulary-editor-actions">
                <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Save changes'}</button>
                <button className="secondary-button" type="button" disabled={saving} onClick={() => { setDraft(null); setNotice(''); }}>Cancel</button>
              </div>
            </form> : <>
              <h3>{entry.expression}</h3>
              {entry.senses.map((sense, index) => <div className="vocabulary-sense" key={sense.id}>
                <h4>Sense {index + 1}</h4>
                {sense.translations.map((item) => <p key={item.id}>{item.text} <span>{item.answer_language_tag}</span></p>)}
                {sense.examples.length ? sense.examples.map((item) => <p className="vocabulary-example" key={item.id}>{item.text}</p>) : <p className="app-empty">No Example added</p>}
              </div>)}
              <div className="vocabulary-entry-actions">
                <button className="secondary-button" type="button" disabled={!online} onClick={() => { setShowForm(false); setNotice(''); setDraft(toDraft(entry)); }}>Edit {entry.expression}</button>
                <button className="secondary-button danger" type="button" disabled={!online} onClick={() => void deleteEntry(entry)}>Delete {entry.expression}</button>
                <button className="secondary-button" type="button" disabled={!online} onClick={() => void setSuspended(entry, !entry.suspended)}>{entry.suspended ? 'Resume' : 'Suspend'} {entry.expression}</button>
              </div>
            </>}
            </div>
          </details>
        </article>)}
      </div>
    </section>
  );
}
