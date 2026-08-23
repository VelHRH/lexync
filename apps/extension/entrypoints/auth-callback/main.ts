import { supabase } from '../../lib/supabase';

const status = document.getElementById('status');
const parameters = new URLSearchParams(window.location.search);
const code = parameters.get('code');
const providerError = parameters.get('error_description') ?? parameters.get('error');

async function completeAuthentication() {
  if (providerError) {
    throw new Error(providerError);
  }

  if (!code) {
    throw new Error('The authentication code is missing.');
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    throw error;
  }

  await browser.runtime.sendMessage({ type: 'auth-complete' });

  if (status) {
    status.textContent = 'Signed in. You can close this tab.';
  }
}

void completeAuthentication().catch((error: unknown) => {
  if (status) {
    status.textContent = error instanceof Error ? error.message : 'Sign-in could not be completed.';
  }
});
