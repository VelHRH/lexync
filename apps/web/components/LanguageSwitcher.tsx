'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { languageName } from '@lexync/domain';
import { languageFlag } from '../lib/languageFlag';

export type SwitchableLanguage = { id: string; languageTag: string };

export function LanguageSwitcher({ languages, value, disabled = false, onChange }: { languages: SwitchableLanguage[]; value: string; disabled?: boolean; onChange: (languageId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLLIElement | null)[]>([]);
  const listboxId = useId();
  const open = expanded && !disabled;
  const selectedIndex = Math.max(languages.findIndex((language) => language.id === value), 0);
  const selected = languages[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    options.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function openMenu(index = selectedIndex) {
    if (disabled) return;
    setActiveIndex(index);
    setExpanded(true);
  }

  function closeMenu(restoreFocus = true) {
    setExpanded(false);
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  }

  function choose(languageId: string) {
    closeMenu();
    if (languageId !== value) onChange(languageId);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowDown' ? selectedIndex : Math.max(selectedIndex, 0));
    }
  }

  function onOptionKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index + 1) % languages.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index - 1 + languages.length) % languages.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(languages.length - 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(languages[index].id);
    }
  }

  if (!selected) return null;

  return <div className="language-switcher" data-ui="language-switcher" ref={container}>
    <button
      aria-controls={open ? listboxId : undefined}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label="Active Learning Language"
      className="language-switcher-trigger"
      data-ui="language-switcher-trigger"
      data-value={selected.id}
      disabled={disabled}
      onClick={() => (open ? closeMenu(false) : openMenu())}
      onKeyDown={onTriggerKeyDown}
      ref={trigger}
      title={`${languageName(selected.languageTag)} · ${selected.languageTag}`}
      type="button"
    >
      <span aria-hidden="true" className="language-flag">{languageFlag(selected.languageTag) || selected.languageTag.slice(0, 2).toUpperCase()}</span>
      <span className="language-tag">{selected.languageTag}</span>
      <span aria-hidden="true" className="language-switcher-chevron" data-ui="select-indicator" />
    </button>
    {open && <ul aria-label="Active Learning Language options" className="language-switcher-menu" id={listboxId} role="listbox">
      {languages.map((language, index) => <li
        aria-selected={language.id === value}
        className={`language-switcher-option${language.id === value ? ' selected' : ''}`}
        data-value={language.id}
        key={language.id}
        onClick={() => choose(language.id)}
        onKeyDown={(event) => onOptionKeyDown(event, index)}
        ref={(element) => { options.current[index] = element; }}
        role="option"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="language-flag">{languageFlag(language.languageTag) || language.languageTag.slice(0, 2).toUpperCase()}</span>
        <span className="language-switcher-option-name">{languageName(language.languageTag)}</span>
        <span className="language-switcher-option-tag">{language.languageTag}</span>
      </li>)}
    </ul>}
  </div>;
}
