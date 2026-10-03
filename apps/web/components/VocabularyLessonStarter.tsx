'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export function VocabularyLessonStarter() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        router.replace('/auth/sign-in');
        return;
      }

      const [{ data: languages, error: languageError }, { data: state }] = await Promise.all([
        supabase.from('learning_languages').select('id').order('created_at'),
        supabase.from('learner_language_state').select('active_learning_language_id').maybeSingle(),
      ]);
      if (cancelled) return;
      if (languageError) {
        setError(languageError.message);
        return;
      }
      const available = languages ?? [];
      const activeId = state?.active_learning_language_id && available.some((language) => language.id === state.active_learning_language_id)
        ? state.active_learning_language_id
        : available[0]?.id ?? '';
      if (!activeId) {
        router.replace('/onboarding/learning-language');
        return;
      }

      const { data, error: startError } = await supabase.rpc('start_or_resume_vocabulary_lesson', { p_learning_language_id: activeId });
      if (cancelled) return;
      if (startError) {
        setError(startError.message);
        return;
      }
      const lessonId = data && typeof data === 'object' && 'id' in data && typeof (data as { id: unknown }).id === 'string' ? (data as { id: string }).id : '';
      if (!lessonId) {
        setError('A Vocabulary Lesson could not be opened right now.');
        return;
      }
      router.replace(`/lessons/${lessonId}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return <main className="lesson-shell" aria-label="Vocabulary Lesson">
      <div className="lesson-main">
        <div className="lesson-state lesson-error" role="alert">
          <p>A Vocabulary Lesson could not be opened.</p>
          <p>{error}</p>
          <Link className="secondary-button" href="/lessons">Back to Lessons</Link>
        </div>
      </div>
    </main>;
  }

  return <main className="lesson-shell" aria-label="Vocabulary Lesson" aria-busy="true">
    <div className="lesson-main">
      <div className="lesson-state" role="status" aria-live="polite"><span className="lesson-skeleton" aria-hidden="true" />Opening Lesson…</div>
    </div>
  </main>;
}
