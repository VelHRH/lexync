'use client';

import { useEffect, useState } from 'react';

const recommendationStorageKey = 'lexync:extension-recommendation';
const handshakeTimeoutMs = 1500;

type RuntimeApi = {
  lastError?: { message?: string };
  sendMessage: (extensionId: string, message: { type: string; protocol: number }, callback?: (response?: unknown) => void) => void;
};

type ChromeGlobal = typeof globalThis & { chrome?: { runtime?: RuntimeApi } };

function isSupportedBrowser() {
  if (typeof navigator === 'undefined') return false;
  return !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) && /chrome|chromium|crios|edg|brave|vivaldi/i.test(navigator.userAgent);
}

function isHandshakeResponse(responseValue: unknown): responseValue is { version: string; capabilities: unknown[] } {
  return Boolean(responseValue) && typeof responseValue === 'object' && typeof (responseValue as { version?: unknown }).version === 'string' && Array.isArray((responseValue as { capabilities?: unknown }).capabilities);
}

function requestHandshake(extensionId: string) {
  return new Promise<unknown>((resolve, reject) => {
    const runtime = (globalThis as ChromeGlobal).chrome?.runtime;
    if (!runtime?.sendMessage) {
      reject(new Error('Extension runtime unavailable.'));
      return;
    }
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };
    let timeout = 0;
    timeout = window.setTimeout(() => finish(() => reject(new Error('Extension handshake timed out.'))), handshakeTimeoutMs);
    try {
      runtime.sendMessage(extensionId, { type: 'web-extension:handshake', protocol: 1 }, (responseValue) => {
        if (runtime.lastError) {
          finish(() => reject(new Error(runtime.lastError?.message ?? 'Extension handshake failed.')));
          return;
        }
        finish(() => resolve(responseValue));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export function ExtensionRecommendation({ extensionId }: { extensionId?: string }) {
  const [visible, setVisible] = useState(false);
  const supportedBrowser = isSupportedBrowser();
  const installUrl = extensionId ? `https://chromewebstore.google.com/detail/lexync/${extensionId}` : undefined;

  useEffect(() => {
    let active = true;
    let suppressed = false;
    try {
      suppressed = window.localStorage.getItem(recommendationStorageKey) !== null;
    } catch {
      suppressed = false;
    }
    if (suppressed) return () => { active = false; };
    if (!extensionId || !supportedBrowser) {
      queueMicrotask(() => {
        if (active) setVisible(true);
      });
      return () => { active = false; };
    }
    void requestHandshake(extensionId).then((response) => {
      if (!active) return;
      if (isHandshakeResponse(response)) {
        try {
          window.localStorage.setItem(recommendationStorageKey, 'installed');
        } catch {
          setVisible(true);
          return;
        }
        return;
      }
      setVisible(true);
    }).catch(() => {
      if (active) setVisible(true);
    });
    return () => { active = false; };
  }, [extensionId, supportedBrowser]);

  function dismiss() {
    try {
      window.localStorage.setItem(recommendationStorageKey, 'dismissed');
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return <section className="extension-recommendation" aria-labelledby="extension-recommendation-heading">
    <div>
      <p className="eyebrow"><span /> Optional companion</p>
      <h2 id="extension-recommendation-heading">Add the Lexync extension</h2>
      <p>Capture language deliberately from third-party webpages and use Learning Mode while you browse. Your private learning data stays in Lexync.</p>
      {!supportedBrowser && <p className="form-notice">The extension is supported on desktop Chrome, Chromium, Edge, Brave, and Vivaldi. Firefox, Safari, and mobile browsers are not supported.</p>}
      {supportedBrowser && !installUrl && <p className="form-notice">The extension install link is not configured yet. You can continue using Lexync without it.</p>}
    </div>
    <div className="extension-recommendation-actions">
      {installUrl && supportedBrowser && <a className="primary-button" href={installUrl} target="_blank" rel="noreferrer">Install extension</a>}
      <button className="text-button" type="button" onClick={dismiss}>Not now</button>
    </div>
  </section>;
}
