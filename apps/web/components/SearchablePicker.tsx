'use client';

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSearchText } from '../lib/searchText';

export type SearchablePickerOption = { id: string; label: string; detail?: string; keywords?: string[] };

function filterOptions(options: SearchablePickerOption[], query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return options;
  return options.filter((option) => [option.label, ...(option.keywords ?? [])].some((haystack) => normalizeSearchText(haystack).includes(needle)));
}

const CREATE_OPTION_ID = 'searchable-picker-create';

export function SearchablePicker({ id, label, value, options, onChange, emptyMessage, disabled = false, describedBy, autoFocus = false, onCreate, onDismiss }: { id: string; label: string; value: string; options: SearchablePickerOption[]; onChange: (id: string) => void; emptyMessage: string; disabled?: boolean; describedBy?: string; autoFocus?: boolean; onCreate?: (name: string) => void; onDismiss?: (reason: 'escape' | 'leave') => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const optionNodes = useRef<(HTMLLIElement | null)[]>([]);
  const listboxId = `${id}-listbox`;
  const selectedLabel = options.find((option) => option.id === value)?.label ?? '';
  const searching = filtering && !disabled;
  const panelOpen = open && !disabled;
  const createName = onCreate && searching ? query.trim() : '';
  const offerCreate = Boolean(createName) && !options.some((option) => normalizeSearchText(option.label) === normalizeSearchText(createName));
  const visible = useMemo(() => {
    const matches = searching ? filterOptions(options, query) : options;
    return offerCreate ? [...matches, { id: CREATE_OPTION_ID, label: `Create “${createName}”` }] : matches;
  }, [createName, offerCreate, options, query, searching]);
  const activeDescendant = panelOpen && visible[activeIndex] ? `${id}-option-${activeIndex}` : undefined;

  const closePanel = useCallback((reason: 'escape' | 'leave') => {
    setOpen(false);
    setFiltering(false);
    setAnnouncement('');
    onDismiss?.(reason);
  }, [onDismiss]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (container.current?.contains(event.target as Node)) return;
      closePanel('leave');
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [closePanel, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    optionNodes.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, panelOpen]);

  function announceList(list: SearchablePickerOption[], typed = '') {
    const name = onCreate ? typed.trim() : '';
    const creatable = Boolean(name) && !options.some((option) => normalizeSearchText(option.label) === normalizeSearchText(name));
    const count = list.length + (creatable ? 1 : 0);
    setAnnouncement(count ? `${count} options available` : emptyMessage);
  }

  function openPanel() {
    setFiltering(false);
    setOpen(true);
    setActiveIndex(Math.max(options.findIndex((option) => option.id === value), 0));
    announceList(options);
  }

  function commit(option: SearchablePickerOption) {
    setOpen(false);
    setFiltering(false);
    setAnnouncement(`${label}: ${option.label}`);
    if (option.id === CREATE_OPTION_ID) onCreate?.(createName);
    else onChange(option.id);
  }

  function move(index: number) {
    setActiveIndex(Math.max(Math.min(index, visible.length - 1), 0));
  }

  function onInputMouseDown(event: React.MouseEvent<HTMLInputElement>) {
    if (document.activeElement !== event.currentTarget) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    if (!panelOpen) openPanel();
  }

  function onInputFocus(event: React.FocusEvent<HTMLInputElement>) {
    event.currentTarget.select();
    openPanel();
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value;
    setQuery(typed);
    setFiltering(true);
    setOpen(true);
    setActiveIndex(0);
    announceList(filterOptions(options, typed), typed);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!panelOpen) {
        openPanel();
        return;
      }
      move(event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1);
      return;
    }
    if (!panelOpen) return;
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
      closePanel('escape');
      return;
    }
    if (event.key === 'Tab') {
      closePanel('leave');
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
        aria-controls={panelOpen ? listboxId : undefined}
        aria-describedby={describedBy}
        aria-expanded={panelOpen}
        autoComplete="off"
        disabled={disabled}
        id={id}
        onBlur={() => { if (panelOpen) closePanel('leave'); }}
        onChange={onInputChange}
        onFocus={onInputFocus}
        onKeyDown={onInputKeyDown}
        onMouseDown={onInputMouseDown}
        ref={input}
        role="combobox"
        type="text"
        value={searching ? query : selectedLabel}
      />
      <span aria-hidden="true" className="searchable-picker-indicator" data-ui="picker-indicator" />
      {panelOpen && <ul aria-label={label} className="searchable-picker-panel" id={listboxId} role="listbox">
        {visible.map((option, index) => <li
          aria-selected={option.id === value}
          className="searchable-picker-option"
          data-create={option.id === CREATE_OPTION_ID ? 'true' : undefined}
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
    <p className="sr-only" role="status">{announcement}</p>
  </div>;
}
