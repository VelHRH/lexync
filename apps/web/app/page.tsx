import Link from 'next/link';
import { connection } from 'next/server';
import { AuthenticatedApp } from '../components/AuthenticatedApp';
import { BrandArtwork } from '../components/BrandArtwork';
import { getChromeExtensionId } from '../lib/extensionRecommendation';

function PublicHome() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Lexync home">
          <BrandArtwork background="light" />
        </a>
        <div className="site-header-actions">
          <Link href="/auth/sign-in">Sign in</Link>
          <Link className="header-action-primary" href="/auth/sign-up">Create account</Link>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Your language, in context</p>
          <h1>Keep the words<br />you choose.</h1>
          <p className="hero-intro">
            Capture meaningful language while you browse. Lexync syncs it privately for practice on your iPhone, even offline.
          </p>
          <a className="text-link" href="#how-it-works">See how the loop works</a>
        </div>

        <div className="hero-artwork" aria-hidden="true">
          <img alt="" height="1024" src="/brand/mark-dark-on-light.png" width="1024" />
        </div>
      </section>

      <section className="principles" id="how-it-works">
        <div className="section-heading">
          <h2>A quieter way to build fluency.</h2>
          <p>No feeds. No bulk imports. Just the language you notice, carried into practice.</p>
        </div>

        <div className="principle-grid">
          <article>
            <h3>Capture with intention</h3>
            <p>Save a word or exact phrase from the web only when you choose to. Keep its translation and the sentence that made it meaningful.</p>
          </article>
          <article>
            <h3>Stay in sync</h3>
            <p>Your private vocabulary moves from the Chromium extension to your iPhone, preserving the Expressions, meanings, and Examples you selected.</p>
          </article>
          <article>
            <h3>Practice offline</h3>
            <p>Review downloaded lessons wherever you are. Your iPhone keeps progress durable and synchronizes it when connectivity returns.</p>
          </article>
        </div>
      </section>

      <section className="surfaces">
        <div className="surfaces-heading">
          <h2>From noticing<br />to knowing.</h2>
        </div>

        <div className="surface-list">
          <article>
            <div>
              <p className="surface-kicker">Where language finds you</p>
              <h3>Chromium extension</h3>
              <p>The optional extension adds deliberate third-party webpage capture and Learning Mode. Site access stays on demand.</p>
            </div>
          </article>
          <article>
            <div>
              <p className="surface-kicker">Where learning continues</p>
              <h3>iPhone app</h3>
              <p>Carry your synchronized library into focused review and Free Practice, with downloaded lessons available offline.</p>
            </div>
          </article>
        </div>

        <p className="web-boundary">This website is the front door, not another study surface.</p>
      </section>

      <footer className="landing-footer">
        <a className="brand footer-brand" href="#top" aria-label="Back to the top">
          <BrandArtwork background="light" />
        </a>
        <div className="footer-meta">
          <Link href="/privacy">Privacy Policy</Link>
          <p>Notice it. Keep it. Know it.</p>
        </div>
      </footer>
    </main>
  );
}

export default async function Home() {
  await connection();
  return <AuthenticatedApp extensionId={getChromeExtensionId(process.env.CHROME_EXTENSION_ID)} publicContent={<PublicHome />} />;
}
