'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { BrandArtwork } from '../../../components/BrandArtwork';
import { supabase } from '../../../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) return setNotice('Password must contain at least 6 characters.');
    if (password !== confirmPassword) return setNotice('Passwords do not match.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setNotice(error.message);
    else setNotice('Password updated. You can sign in with your new password.');
  }

  return (
    <main className="auth-page auth-recovery" data-design="auth-recovery">
      <aside className="auth-recovery-aside">
        <Link className="auth-recovery-brand" href="/" aria-label="Lexync home"><BrandArtwork background="light" /></Link>
        <div>
          <p className="auth-recovery-title">Back to the words that matter.</p>
          <p className="auth-recovery-detail">Your private library will be ready when you are.</p>
        </div>
      </aside>
      <div className="auth-card">
        <Link className="auth-brand" href="/" aria-label="Lexync home"><BrandArtwork background="light" /></Link>
        <h1>Choose a new password</h1>
        <form className="web-auth-form" onSubmit={submit} aria-describedby={notice ? 'reset-notice' : undefined}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="confirm-new-password">Confirm new password</label>
          <input id="confirm-new-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {notice && <p id="reset-notice" className="form-notice" role="status">{notice}</p>}
          <button className="primary-button" type="submit">Update password</button>
        </form>
      </div>
    </main>
  );
}
