'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'success'>('error');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setNoticeTone('error');
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setNotice('Enter a valid email address.');
      document.getElementById('email')?.focus();
      return;
    }
    if (mode !== 'forgot-password' && password.length < 6) {
      setNotice('Password must contain at least 6 characters.');
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      setNotice('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
        });
        if (error) throw error;
        setNoticeTone('success');
        setNotice('Check your email for a password reset link.');
      } else if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) window.location.assign('/');
        else {
          setNoticeTone('success');
          setNotice('Check your email to confirm your account.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        window.location.assign('/');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'sign-up' ? 'Create your private library' : mode === 'forgot-password' ? 'Reset your password' : 'Welcome back';
  const submitLabel = mode === 'sign-up' ? 'Create account' : mode === 'forgot-password' ? 'Send reset link' : 'Sign in';

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/" aria-label="Lexync home">Lexync</Link>
        <p className="eyebrow"><span /> Private learning</p>
        <h1>{title}</h1>
        <p className="auth-intro">{mode === 'sign-in' ? 'Sign in to continue.' : 'Your vocabulary stays personal, synchronized, and ready when you are.'}</p>
        <form className="web-auth-form" onSubmit={submit} noValidate>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {mode !== 'forgot-password' && <>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </>}
          {mode === 'sign-up' && <>
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </>}
          {notice && <p className={noticeTone === 'error' ? 'form-notice error' : 'form-notice'} role={noticeTone === 'error' ? 'alert' : 'status'}>{notice}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Working…' : submitLabel}</button>
        </form>
        <nav className="auth-links" aria-label="Account actions">
          {mode === 'sign-in' && <><Link href="/auth/sign-up">Create account</Link><Link href="/auth/forgot-password">Forgot password?</Link></>}
          {mode !== 'sign-in' && <Link href="/auth/sign-in">Sign in</Link>}
        </nav>
      </div>
    </main>
  );
}
