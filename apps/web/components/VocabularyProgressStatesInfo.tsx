'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PROGRESS_STATE_LABELS, VOCABULARY_PROGRESS_STATES, type VocabularyProgressState } from '../lib/vocabularyProgress';

const PROGRESS_STATE_DESCRIPTIONS: Record<VocabularyProgressState, string> = {
  new: 'not practised yet.',
  'in-practice': 'answered at least once but not learned yet.',
  learned: 'answered correctly 5 times in a row, for every meaning. A wrong answer starts that meaning over.',
};

export function VocabularyProgressStatesInfo() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className="progress-states-info" ref={container} onBlur={(event) => { if (open && !container.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} className="progress-states-info-trigger" type="button" aria-label="About Vocabulary Progress States" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((current) => !current)}>
      <svg aria-hidden="true" focusable="false" height="20" viewBox="0 0 24 24" width="20">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 10.75v5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="12" cy="7.6" r="1.1" fill="currentColor" />
      </svg>
    </button>
    {open && <div ref={panel} className="progress-states-info-panel" id={panelId} role="dialog" aria-labelledby={headingId} tabIndex={-1} data-ui="progress-states-info">
      <h2 id={headingId}>Vocabulary Progress States</h2>
      <ul>
        {VOCABULARY_PROGRESS_STATES.map((state) => <li key={state} data-state={state}><strong>{PROGRESS_STATE_LABELS[state]}</strong>: {PROGRESS_STATE_DESCRIPTIONS[state]}</li>)}
      </ul>
    </div>}
  </div>;
}
