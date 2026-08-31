'use client';

import { studyPairLabel, type StudyPair } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';

type LibraryEntry = {
  id: string;
  expression: string;
  senses: Array<{ translations: Array<{ text: string }>; examples: Array<{ text: string }> }>;
};

export function VocabularyLibrary({ pair }: { pair: StudyPair }) {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expression, setExpression] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vocabulary_entries').select('id,expression').eq('study_pair_id', pair.id).order('created_at');
    if (error) {
      setNotice(error.message);
      setLoading(false);
      return;
    }
    const entryIds = (data ?? []).map((entry) => entry.id);
    const { data: senses, error: sensesError } = entryIds.length
      ? await supabase.from('senses').select('id,vocabulary_entry_id').in('vocabulary_entry_id', entryIds)
      : { data: [], error: null };
    if (sensesError) {
      setNotice(sensesError.message);
      setLoading(false);
      return;
    }
    const senseIds = (senses ?? []).map((sense) => sense.id);
    const [{ data: translations, error: translationsError }, { data: examples, error: examplesError }] = await Promise.all([
      supabase.from('translations').select('sense_id,text').in('sense_id', senseIds),
      supabase.from('examples').select('sense_id,text').in('sense_id', senseIds),
    ]);
    if (translationsError || examplesError) {
      setNotice(translationsError?.message ?? examplesError?.message ?? 'Vocabulary details could not be loaded.');
      setLoading(false);
      return;
    }
    setEntries((data ?? []).map((entry) => ({
      id: entry.id,
      expression: entry.expression,
      senses: (senses ?? []).filter((sense) => sense.vocabulary_entry_id === entry.id).map((sense) => ({
        translations: (translations ?? []).filter((item) => item.sense_id === sense.id),
        examples: (examples ?? []).filter((item) => item.sense_id === sense.id),
      })),
    })));
    setLoading(false);
  }, [pair.id]);

  useEffect(() => {
    queueMicrotask(() => void loadEntries());
    queueMicrotask(() => {
      if (searchParams.get('add') === '1') {
        setShowForm(true);
        window.history.replaceState(null, '', '/library');
      }
    });
  }, [loadEntries, searchParams]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const missing = [!expression.trim() ? 'Expression is required.' : '', !translation.trim() ? 'Translation is required.' : ''].filter(Boolean);
    if (missing.length) {
      setNotice(missing.join(' '));
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('capture_manual_entry', {
      p_example: example,
      p_expression: expression,
      p_study_pair_id: pair.id,
      p_translation: translation,
    });
    setSaving(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setExpression('');
    setTranslation('');
    setExample('');
    setShowForm(false);
    await loadEntries();
  }

  return (
    <section className="vocabulary-library" aria-labelledby="library-heading">
      <div className="library-toolbar">
        <div>
          <p className="eyebrow"><span /> {studyPairLabel(pair)}</p>
          <h2 id="library-heading">Vocabulary Library</h2>
        </div>
        <button className="primary-button" type="button" onClick={() => { setNotice(''); setShowForm(true); }}>Add vocabulary</button>
      </div>
      {showForm && <form className="web-auth-form vocabulary-form" onSubmit={save}>
        <label htmlFor="expression">Expression</label>
        <input id="expression" value={expression} onChange={(event) => setExpression(event.target.value)} />
        <label htmlFor="translation">Translation</label>
        <input id="translation" value={translation} onChange={(event) => setTranslation(event.target.value)} />
        <label htmlFor="example">Example <span>(optional)</span></label>
        <textarea id="example" value={example} onChange={(event) => setExample(event.target.value)} />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Vocabulary Entry'}</button>
      </form>}
      {loading && <p className="app-empty">Loading your vocabulary…</p>}
      {!loading && entries.length === 0 && <p className="app-empty">No vocabulary entries yet. Add your first one.</p>}
      <div className="vocabulary-entry-list">
        {entries.map((entry) => <details className="vocabulary-entry" key={entry.id}>
          <summary>{entry.expression}</summary>
          <div>
            <h3>{entry.expression}</h3>
            {entry.senses.map((sense, index) => <div className="vocabulary-sense" key={`${entry.id}-${index}`}>
              {sense.translations.map((item) => <p key={item.text}>{item.text}</p>)}
              {sense.examples.length ? sense.examples.map((item) => <p className="vocabulary-example" key={item.text}>{item.text}</p>) : <p className="app-empty">No Example added</p>}
            </div>)}
          </div>
        </details>)}
      </div>
    </section>
  );
}
