'use client';

import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSearchText } from '../lib/searchText';

export type SearchablePickerOption = { id: string; label: string; detail?: string; keywords?: string[] };

function filterOptions(options: SearchablePickerOption[], query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return options;
  return options.filter((option) => [option.label, ...(option.keywords ?? [])].some((haystack) => normalizeSearchText(haystack).includes(needle)));
}

export function SearchablePicker({ id, label, value, options, onChange, placeholder, emptyMessage = 'No matches', disabled = false }: { id: string; label: string; value: string; options: SearchablePickerOption[]; onChange: (id: string) => void; placeholder?: string; emptyMessage?: string; disabled?: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const optionNodes = useRef<(HTMLLIElement | null)[]>([]);
  const listboxId = `${id}-listbox`;
  const open = expanded && !disabled;
  const selectedLabel = options.find((option) => option.id === value)?.label ?? '';
  const visible = useMemo(() => (filtering ? filterOptions(options, query) : options), [filtering, options, query]);
  const activeDescendant = open && visible[activeIndex] ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (container.current?.contains(event.target as Node)) return;
      setExpanded(false);
      setFiltering(false);
      setAnnouncement('');
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionNodes.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function announceList(list: SearchablePickerOption[]) {
    setAnnouncement(list.length ? `${list.length} options available` : emptyMessage);
  }

  function openPanel() {
    if (disabled) return;
    setFiltering(false);
    setExpanded(true);
    setActiveIndex(Math.max(options.findIndex((option) => option.id === value), 0));
    announceList(options);
  }

  function closePanel() {
    setExpanded(false);
    setFiltering(false);
    setAnnouncement('');
  }

  function commit(option: SearchablePickerOption) {
    setExpanded(false);
    setFiltering(false);
    setAnnouncement(`${label}: ${option.label}`);
    onChange(option.id);
  }

  function move(index: number) {
    setActiveIndex(Math.max(Math.min(index, visible.length - 1), 0));
  }

  function onInputMouseDown(event: React.MouseEvent<HTMLInputElement>) {
    if (disabled) return;
    if (document.activeElement !== event.currentTarget) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    if (!open) openPanel();
  }

  function onInputFocus(event: React.FocusEvent<HTMLInputElement>) {
    event.currentTarget.select();
    openPanel();
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value;
    setQuery(typed);
    setFiltering(true);
    setExpanded(true);
    setActiveIndex(0);
    announceList(filterOptions(options, typed));
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPanel();
        return;
      }
      move(event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1);
      return;
    }
    if (!open) return;
    if (event.key === 'Home') {
      event.preventDefault();
      move(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      move(visible.length - 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key === 'Tab') {
      closePanel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) commit(option);
    }
  }

  return <div className="field searchable-picker" data-ui="searchable-picker" ref={container}>
    <label htmlFor={id}>{label}</label>
    <div className="searchable-picker-control">
      <input
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        id={id}
        onBlur={() => { if (open) closePanel(); }}
        onChange={onInputChange}
        onFocus={onInputFocus}
        onKeyDown={onInputKeyDown}
        onMouseDown={onInputMouseDown}
        placeholder={placeholder}
        role="combobox"
        type="text"
        value={filtering ? query : selectedLabel}
      />
      <span aria-hidden="true" className="searchable-picker-indicator" data-ui="picker-indicator" />
      {open && <ul aria-label={label} className="searchable-picker-panel" id={listboxId} role="listbox">
        {visible.map((option, index) => <li
          aria-selected={option.id === value}
          className="searchable-picker-option"
          data-highlighted={index === activeIndex}
          data-value={option.id}
          id={`${id}-option-${index}`}
          key={option.id}
          onMouseDown={(event) => { event.preventDefault(); commit(option); }}
          ref={(element) => { optionNodes.current[index] = element; }}
          role="option"
        >
          <span className="searchable-picker-option-name">{option.label}</span>
          {option.detail && <span className="searchable-picker-option-detail">{option.detail}</span>}
        </li>)}
        {!visible.length && <li className="searchable-picker-empty" role="presentation">{emptyMessage}</li>}
      </ul>}
    </div>
    <p className="collections-sr-only" role="status">{announcement}</p>
  </div>;
}
