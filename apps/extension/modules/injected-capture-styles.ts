import { shadowTokenCss } from '@lexync/design-system';

export const captureDockCss = `
${shadowTokenCss}
* { box-sizing: border-box; }
.capture {
  position: fixed;
  left: 50%;
  bottom: max(var(--lexync-space-4), env(safe-area-inset-bottom));
  z-index: var(--lexync-z-injected);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--lexync-space-4);
  width: min(640px, calc(100vw - var(--lexync-space-6)));
  max-height: calc(100vh - var(--lexync-space-8));
  overflow: auto;
  padding: var(--lexync-space-3) var(--lexync-space-4);
  border: 1px solid var(--lexync-color-border);
  border-radius: var(--lexync-radius-lg);
  background: var(--lexync-color-surface);
  box-shadow: var(--lexync-elevation-medium);
  transform: translateX(-50%);
  color: var(--lexync-color-ink);
  font: var(--lexync-type-weight-semibold) var(--lexync-type-size-sm)/var(--lexync-type-line-normal) var(--lexync-type-family-body);
}
.context-region { display: grid; min-width: 0; gap: var(--lexync-space-1); padding: var(--lexync-space-2) var(--lexync-space-3); border-radius: var(--lexync-radius-md); background: var(--lexync-color-surface-subtle); }
.context-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--lexync-space-3); }
.kicker { margin: 0; color: var(--lexync-color-brand-primary); font-size: var(--lexync-type-size-xs); font-weight: var(--lexync-type-weight-bold); }
.context-detail { margin: 0; overflow: hidden; color: var(--lexync-color-ink); font-size: var(--lexync-type-size-sm); line-height: var(--lexync-type-line-normal); text-overflow: ellipsis; white-space: nowrap; }
.context { margin: 0; overflow: hidden; color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); line-height: var(--lexync-type-line-normal); text-overflow: ellipsis; white-space: nowrap; }
.mark { flex: 0 0 auto; color: var(--lexync-color-ink-muted); font: var(--lexync-type-weight-bold) var(--lexync-type-size-xs)/var(--lexync-type-line-normal) var(--lexync-type-family-mono); }
.action-region { display: grid; justify-items: end; gap: var(--lexync-space-1); min-width: max-content; }
button { min-height: 2.75rem; padding: var(--lexync-space-2) var(--lexync-space-4); border: 1px solid var(--lexync-color-brand-primary); border-radius: var(--lexync-radius-md); background: var(--lexync-color-brand-primary); color: var(--lexync-color-white); cursor: pointer; font: inherit; }
button span { display: inline-flex; align-items: center; gap: var(--lexync-space-2); }
.button-arrow { font-size: var(--lexync-type-size-lg); line-height: 1; }
button:hover { background: var(--lexync-color-brand-primary-hover); }
button:focus-visible { outline: var(--lexync-focus-width) solid var(--lexync-focus-color); outline-offset: var(--lexync-focus-offset); box-shadow: var(--lexync-focus-ring); }
button:disabled { cursor: wait; opacity: 0.55; }
button:active { transform: translateY(1px); }
.sense-choice { display: grid; grid-column: 1 / -1; gap: var(--lexync-space-2); margin: 0; padding: var(--lexync-space-3) 0 0; border: 0; border-top: 1px solid var(--lexync-color-border); font: inherit; }
.sense-choice legend { padding: 0; font-size: var(--lexync-type-size-xs); font-weight: var(--lexync-type-weight-bold); }
.sense-options { display: grid; gap: var(--lexync-space-2); }
.sense-choice label { display: flex; gap: var(--lexync-space-2); align-items: flex-start; font-weight: var(--lexync-type-weight-regular); }
.sense-choice input { width: 1rem; height: 1rem; }
[role="status"] { max-width: 20rem; color: var(--lexync-color-ink-muted); font-size: var(--lexync-type-size-xs); text-align: end; }
[role="status"]:empty { display: none; }
[hidden] { display: none; }
@media (max-width: 520px) {
  .capture { left: var(--lexync-space-3); right: var(--lexync-space-3); bottom: max(var(--lexync-space-3), env(safe-area-inset-bottom)); grid-template-columns: 1fr; width: auto; transform: none; }
  .action-region { justify-items: stretch; min-width: 0; }
  button { width: 100%; }
  [role="status"] { max-width: none; text-align: start; }
  .sense-choice { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
}
`;
