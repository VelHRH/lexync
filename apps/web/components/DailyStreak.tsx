'use client';

import { useEffect, useState } from 'react';
import { readDailyStreak, reportLearnerTimezone, streakDays, type DailyStreak as DailyStreakValue } from '../lib/dailyStreak';

export function StreakFlame({ className = 'streak-flame' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} focusable="false" height="20" viewBox="0 0 24 24" width="20">
    <path d="M12 2.5c.8 2.9 3.6 4.7 4.9 7.4.7 1.4 1.1 2.9 1.1 4.3a6 6 0 0 1-12 0c0-2.4 1-4.3 2.6-5.8.1 1.6.8 2.8 2 3.4-.4-3.6.3-6.6 1.4-9.3Z" fill="var(--streak-flame-fill, none)" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    <path d="M12 13.2c.9 1.1 2 2 2 3.5a2 2 0 0 1-4 0c0-1.3.9-2.3 2-3.5Z" fill="var(--streak-flame-core, none)" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
  </svg>;
}

export function DailyStreakBadge() {
  const [streak, setStreak] = useState<DailyStreakValue | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      await reportLearnerTimezone();
      const next = await readDailyStreak();
      if (cancelled) return;
      setStreak(next);
      setLoaded(true);
    }
    void refresh();
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  if (!loaded) return <div className="daily-streak daily-streak-loading" aria-hidden="true"><span className="skeleton daily-streak-skeleton" /></div>;
  if (!streak) return null;

  const state = streak.extendedToday ? 'extended-today' : 'not-yet-today';
  const label = `Daily Streak: ${streakDays(streak.current)}, ${streak.extendedToday ? 'extended today' : 'not yet today'}`;

  return <div aria-atomic="true" aria-label={label} className="daily-streak" data-state={state} data-ui="daily-streak" role="status" title={label}>
    <StreakFlame />
    <span className="daily-streak-text" aria-hidden="true">
      <span className="daily-streak-count">{streak.current}<span className="daily-streak-unit"> {streak.current === 1 ? 'day' : 'days'}</span></span>
      <span className="daily-streak-caption">{streak.extendedToday ? 'Extended today' : 'Not yet today'}</span>
    </span>
    <span className="visually-hidden">{label}</span>
  </div>;
}
