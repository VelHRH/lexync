import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type SelectOption<Value extends string = string> = { value: Value; label: string };

type SelectProps<Value extends string> = {
  id?: string;
  labelId: string;
  options: readonly SelectOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
};

const TYPEAHEAD_RESET_MS = 500;

function isPrintableKey(event: KeyboardEvent) {
  return event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function Select<Value extends string>({ id, labelId, options, value, onChange, disabled = false, describedBy, className }: SelectProps<Value>) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listboxId = `${triggerId}-listbox`;
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionElements = useRef<(HTMLLIElement | null)[]>([]);
  const typeahead = useRef({ text: '', timer: 0 });
  const open = expanded && !disabled && options.length > 0;
  const selectedIndex = Math.max(options.findIndex((option) => option.value === value), 0);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionElements.current[activeIndex]?.focus({ preventScroll: false });
  }, [activeIndex, open]);

  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

  function openMenu(index = selectedIndex) {
    if (disabled || options.length === 0) return;
    setActiveIndex(index);
    setExpanded(true);
  }

  function resetTypeahead() {
    window.clearTimeout(typeahead.current.timer);
    typeahead.current.text = '';
  }

  function closeMenu(restoreFocus = true) {
    resetTypeahead();
    setExpanded(false);
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  }

  function choose(index: number) {
    const option = options[index];
    closeMenu();
    if (option && option.value !== value) onChange(option.value);
  }

  function matchTypeahead(key: string, from: number) {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.text += key.toLocaleLowerCase();
    state.timer = window.setTimeout(() => { state.text = ''; }, TYPEAHEAD_RESET_MS);
    const repeated = state.text.length > 1 && [...state.text].every((character) => character === state.text[0]);
    const query = repeated ? state.text.charAt(0) : state.text;
    const start = query.length === 1 ? from + 1 : from;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset) % options.length;
      if (options[index]?.label.toLocaleLowerCase().startsWith(query)) return index;
    }
    return -1;
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      openMenu(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (isPrintableKey(event)) {
      const match = matchTypeahead(event.key, selectedIndex);
      if (match >= 0) {
        event.preventDefault();
        openMenu(match);
      }
    }
  }

  function onOptionKeyDown(event: KeyboardEvent, index: number) {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(index + 1, last),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: last,
      PageDown: Math.min(index + 10, last),
      PageUp: Math.max(index - 10, 0),
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setActiveIndex(move);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(index);
      return;
    }
    if (isPrintableKey(event)) {
      const match = matchTypeahead(event.key, index);
      if (match >= 0) {
        event.preventDefault();
        setActiveIndex(match);
      }
    }
  }

  return <div className={['lexync-select', className].filter(Boolean).join(' ')} data-ui="select" ref={container}>
    <button
      aria-controls={open ? listboxId : undefined}
      aria-describedby={describedBy}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-labelledby={`${labelId} ${triggerId}`}
      className="lexync-select-trigger"
      data-value={selected?.value ?? ''}
      disabled={disabled}
      id={triggerId}
      onClick={() => (open ? closeMenu(false) : openMenu())}
      onKeyDown={onTriggerKeyDown}
      ref={trigger}
      type="button"
    >
      <span className="lexync-select-value">{selected?.label ?? ''}</span>
      <span aria-hidden="true" className="lexync-select-indicator" data-ui="select-indicator" />
    </button>
    {open && <ul aria-labelledby={labelId} className="lexync-select-listbox" id={listboxId} role="listbox">
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return <li
          aria-selected={isSelected}
          className="lexync-select-option"
          data-value={option.value}
          key={option.value}
          onClick={() => choose(index)}
          onKeyDown={(event) => onOptionKeyDown(event, index)}
          onPointerMove={() => { if (activeIndex !== index) setActiveIndex(index); }}
          ref={(element) => { optionElements.current[index] = element; }}
          role="option"
          tabIndex={index === activeIndex ? 0 : -1}
        >
          <span className="lexync-select-option-label">{option.label}</span>
          {isSelected && <svg aria-hidden="true" className="lexync-select-check" data-ui="select-check" focusable="false" viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>}
        </li>;
      })}
    </ul>}
  </div>;
}
