import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

const status = document.getElementById('status');
const statusAlert = document.getElementById('status-alert');
const passwordForm = document.querySelector<HTMLFormElement>('#password-form');
const passwordInput = document.querySelector<HTMLInputElement>('#password');
const confirmPasswordInput = document.querySelector<HTMLInputElement>('#confirm-password');
const parameters = new URLSearchParams(window.location.search);
const code = parameters.get('code');
const providerError = parameters.get('error_description') ?? parameters.get('error');
let recoveryTokens: { access_token: string; refresh_token: string } | null = null;
const recoveryClient = createClient(
  import.meta.env.WXT_PUBLIC_SUPABASE_URL,
  import.meta.env.WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);

function showStatus(message: string, role: 'alert' | 'status' = 'status') {
  if (status) {
    status.textContent = message;
  }

  if (statusAlert) {
    statusAlert.textContent = role === 'alert' ? message : '';
    statusAlert.hidden = role !== 'alert';
  }
}

async function completeAuthentication() {
  if (providerError) {
    throw new Error(providerError);
  }

  if (!code) {
    throw new Error('The authentication code is missing.');
  }

  let passwordRecovery = false;
  const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecovery = true;
    }
  });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  authListener.subscription.unsubscribe();

  if (error) {
    throw error;
  }

  if (passwordRecovery) {
    recoveryTokens = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };

    showStatus('Choose a new password.');

    if (passwordForm) {
      passwordForm.hidden = false;
    }

    return;
  }

  showStatus('Signed in. You can close this tab.');

  void browser.runtime.sendMessage({ type: 'auth-complete' }).catch(() => undefined);
}

passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passwordInput?.value ?? '';
  const confirmPassword = confirmPasswordInput?.value ?? '';

  if (password.length < 6) {
    showStatus('Password must contain at least 6 characters.', 'alert');
    return;
  }

  if (password !== confirmPassword) {
    showStatus('Passwords do not match.', 'alert');
    return;
  }

  const button = passwordForm.querySelector<HTMLButtonElement>('button');

  if (button) {
    button.disabled = true;
  }

  try {
    if (recoveryTokens) {
      const { error: sessionError } = await recoveryClient.auth.setSession(recoveryTokens);

      if (sessionError) {
        throw sessionError;
      }
    }

    const { error } = await recoveryClient.auth.updateUser({ password });

    if (error) {
      showStatus(error.message, 'alert');
      return;
    }

    passwordForm.hidden = true;

    showStatus('Password updated. You can close this tab.');

    const { data } = await recoveryClient.auth.getSession();

    if (data.session) {
      void supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    void browser.runtime.sendMessage({ type: 'auth-complete' }).catch(() => undefined);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Password could not be updated.', 'alert');
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
});

void completeAuthentication().catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : 'Sign-in could not be completed.', 'alert');
});
