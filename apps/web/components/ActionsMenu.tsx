'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type MenuAction = { key: string; label: string; danger?: boolean; disabled?: boolean };

export function ActionsMenu({ triggerLabel, menuLabel, actions, open, disabled, describedBy, onOpenChange, onAction }: {
  triggerLabel: string;
  menuLabel: string;
  actions: MenuAction[];
  open: boolean;
  disabled: boolean;
  describedBy?: string;
  onOpenChange: (open: boolean) => void;
  onAction: (key: string, trigger: HTMLButtonElement | null) => void;
}) {
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<CSSProperties | null>(null);
  const expanded = open && !disabled;

  useLayoutEffect(() => {
    if (!expanded || !trigger.current) {
      setPlacement(null);
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    const roomBelow = window.innerHeight - rect.bottom;
    const menuHeight = list.current?.offsetHeight ?? 0;
    setPlacement(roomBelow >= menuHeight + 8 || rect.top < menuHeight + 8
      ? { top: rect.bottom + 4, right }
      : { bottom: window.innerHeight - rect.top + 4, right });
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnScroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [expanded, onOpenChange]);

  useEffect(() => {
    if (expanded && placement) items.current[activeIndex]?.focus();
  }, [activeIndex, expanded, placement]);

  function show(index: number) {
    setActiveIndex(index);
    onOpenChange(true);
  }

  function close(restoreFocus: boolean) {
    onOpenChange(false);
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  }

  function runAction(action: MenuAction) {
    if (action.disabled) return;
    onOpenChange(false);
    onAction(action.key, trigger.current);
  }

  function triggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      show(actions.length - 1);
    }
  }

  function menuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = actions.length - 1;
    if (event.key === 'ArrowDown') setActiveIndex((index) => index === last ? 0 : index + 1);
    else if (event.key === 'ArrowUp') setActiveIndex((index) => index === 0 ? last : index - 1);
    else if (event.key === 'Home') setActiveIndex(0);
    else if (event.key === 'End') setActiveIndex(last);
    else if (event.key === 'Escape') { event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') { onOpenChange(false); return; }
    else return;
    event.preventDefault();
  }

  return <div className="actions-menu" ref={container}>
    <button ref={trigger} className="actions-menu-trigger" type="button" aria-label={triggerLabel} aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded ? menuId : undefined} aria-describedby={describedBy} disabled={disabled} onClick={() => expanded ? close(false) : show(0)} onKeyDown={triggerKeyDown}>
      <svg aria-hidden="true" fill="currentColor" focusable="false" height="20" viewBox="0 0 24 24" width="20"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>
    </button>
    {expanded && <ul ref={list} className="actions-menu-list" id={menuId} role="menu" aria-label={menuLabel} style={placement ?? { visibility: 'hidden' }} data-placement={placement && 'bottom' in placement ? 'above' : 'below'} onKeyDown={menuKeyDown}>
      {actions.map((action, index) => <li key={action.key} role="none">
        <button ref={(element) => { items.current[index] = element; }} className={action.danger ? 'actions-menu-item danger' : 'actions-menu-item'} type="button" role="menuitem" tabIndex={index === activeIndex ? 0 : -1} aria-disabled={action.disabled || undefined} onClick={() => runAction(action)}>{action.label}</button>
      </li>)}
    </ul>}
  </div>;
}
