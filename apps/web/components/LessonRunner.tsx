'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { Lesson } from './Lesson';

type LanguageRow = { id: string; language_tag: string };

export function LessonRunner({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [languages, setLanguages] = useState<LanguageRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        router.replace('/auth/sign-in');
        return;
      }
      const { data } = await supabase.from('learning_languages').select('id,language_tag');
      if (cancelled) return;
      setLanguages(data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (languages === null) {
    return <main className="lesson-shell" aria-label="Lesson" aria-busy="true">
      <div className="lesson-main">
        <><p className="visually-hidden" role="status" aria-live="polite">Opening Lesson…</p>
      <div className="lesson-loading" aria-hidden="true">
        <div className="skeleton lesson-loading-direction" />
        <div className="skeleton lesson-loading-prompt" />
        <div className="lesson-loading-choices">
          <div className="skeleton lesson-loading-choice" />
          <div className="skeleton lesson-loading-choice" />
          <div className="skeleton lesson-loading-choice" />
          <div className="skeleton lesson-loading-choice" />
        </div>
      </div></>
      </div>
    </main>;
  }

  return <Lesson
    languages={languages}
    lessonId={lessonId}
    onExit={() => router.push('/lessons')}
    onPractiseSomethingElse={() => router.push('/')}
    onLessonStarted={(startedLessonId) => router.replace(`/lessons/${startedLessonId}`)}
  />;
}
