'use client';

import { useEffect, useRef } from 'react';

export function useModalDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
    };
  }, []);

  return dialogRef;
}
