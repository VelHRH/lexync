import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Lexync',
  description: 'How Lexync handles account, learning, and browser data.',
};

const BrandArtwork = () => (
  <picture className="brand-artwork">
    <source media="(max-width: 560px)" srcSet="/brand/mark-dark-on-light.png" />
    <img alt="" height="724" src="/brand/wordmark-dark-on-light.png" width="2172" />
  </picture>
);

export default function PrivacyPolicy() {
  return (
    <main className="privacy-page">
      <header className="site-header privacy-header">
        <Link className="brand" href="/" aria-label="Lexync home">
          <BrandArtwork />
        </Link>
        <Link className="text-link" href="/">Back to Lexync</Link>
      </header>

      <div className="privacy-layout">
        <aside className="privacy-summary" aria-label="Policy summary">
          <p>Effective September 3, 2026</p>
          <strong>In short</strong>
          <p>Lexync uses your data to provide your private language-learning library. It does not sell it, use it for advertising, or use it to assess creditworthiness.</p>
        </aside>

        <article className="privacy-policy">
          <header>
            <p className="eyebrow"><span /> Privacy Policy</p>
            <h1>Your words stay yours.</h1>
            <p>This policy explains how Lexync handles information when you use its Chromium extension, website, and companion applications.</p>
          </header>

          <section>
            <h2>Information Lexync handles</h2>
            <h3>Account and authentication information</h3>
            <p>Lexync uses your email address to create and identify your account, confirm your email, sign you in, and support password recovery. Passwords are submitted to Supabase Auth and are not stored by the Lexync application in readable form. Authentication tokens are stored on your device so that you can remain signed in.</p>

            <h3>Learning material</h3>
            <p>When you choose to save material, Lexync stores your learning languages, words and phrases, translations, examples, vocabulary organization, and learning progress. This information is synchronized with your account so it is available across Lexync clients.</p>

            <h3>Browsing context and website content</h3>
            <p>The extension processes the current page URL, its domain, and a sample of visible page text to detect language, show whether Learning Mode is available, highlight saved expressions, and provide capture tools. Page-language detection happens locally in the browser. Lexync does not request your Chrome browsing-history database or create a server-side history of the pages you visit.</p>
            <p>Site-specific Learning Mode preferences and domain names are stored locally in the extension. Website text is sent to Lexync servers only when you deliberately save a word, phrase, translation, or example to your library.</p>

            <h3>Technical information</h3>
            <p>Our infrastructure providers may process IP addresses, browser and device information, request metadata, and authentication events in security and operational logs. Lexync uses this information to operate, secure, and troubleshoot the service, not to track you for advertising.</p>
          </section>

          <section>
            <h2>How information is used</h2>
            <ul>
              <li>Authenticate your account and keep it secure.</li>
              <li>Save and synchronize the learning material you choose.</li>
              <li>Detect learning languages and provide capture and highlighting features.</li>
              <li>Maintain, protect, and troubleshoot Lexync.</li>
              <li>Comply with applicable legal obligations.</li>
            </ul>
            <p>Lexync does not sell personal data, use it for personalized advertising, or use it for lending or credit decisions.</p>
          </section>

          <section>
            <h2>Service providers and sharing</h2>
            <p>Lexync uses Supabase for authentication, database storage, synchronization, and operational logging, and Vercel to host the website. These providers process information on our behalf to deliver and secure Lexync. Information may also be disclosed when required by law, to protect users or the service, or as part of a business transfer where permitted by law.</p>
            <p>Lexync does not transfer user data to third parties for advertising, data brokerage, or purposes unrelated to the product&apos;s user-facing features.</p>
          </section>

          <section>
            <h2>Chrome Web Store Limited Use</h2>
            <p>Lexync&apos;s use and transfer of information received from Chrome APIs complies with the <a href="https://developer.chrome.com/docs/webstore/program-policies/user-data/" rel="noreferrer">Chrome Web Store User Data Policy</a>, including its Limited Use requirements.</p>
          </section>

          <section>
            <h2>Retention and deletion</h2>
            <p>Account and synchronized learning data are retained while your account is active. You can delete individual learning entries within Lexync. You may request deletion of your account and associated server-side data by contacting us. Signing out removes the locally stored authentication session. Other locally stored extension data can be removed by clearing the extension&apos;s data or uninstalling the extension. Infrastructure logs are retained according to the service provider&apos;s applicable retention period.</p>
          </section>

          <section>
            <h2>Security</h2>
            <p>Lexync transmits account and learning data over encrypted HTTPS connections. Access to synchronized data is restricted to the authenticated account. No method of electronic storage or transmission is completely secure, but we use reasonable technical measures to protect the information Lexync handles.</p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>You decide which learning material to save and which sites use Learning Mode. You can disable Learning Mode for a site, remove its access through your browser settings, delete saved entries, sign out, clear local extension data, or uninstall the extension.</p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>We may update this policy when Lexync or its legal obligations change. The effective date at the top of this page will identify the latest version.</p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>For privacy questions or account-deletion requests, email <a href="mailto:yrchenko644@gmail.com">yrchenko644@gmail.com</a>.</p>
          </section>
        </article>
      </div>

      <footer className="privacy-footer">
        <Link className="brand footer-brand" href="/" aria-label="Lexync home">
          <picture className="brand-artwork">
            <source media="(max-width: 560px)" srcSet="/brand/mark-light-on-dark.png" />
            <img alt="" height="724" src="/brand/wordmark-light-on-dark.png" width="2172" />
          </picture>
        </Link>
        <p>Privacy Policy · Effective September 3, 2026</p>
      </footer>
    </main>
  );
}
