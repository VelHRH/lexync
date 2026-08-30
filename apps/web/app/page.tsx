const Arrow = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const ExtensionMark = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48">
    <path d="M11 15.5h26a4 4 0 0 1 4 4V34a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V19.5a4 4 0 0 1 4-4Z" />
    <path d="M15 10v7M24 10v7M33 10v7M15 26h8M15 31h14" />
  </svg>
);

const PhoneMark = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48">
    <rect x="13" y="5" width="22" height="38" rx="6" />
    <path d="M20 10h8M22 37h4" />
  </svg>
);

const BrandArtwork = ({ surface }: { surface: 'dark' | 'light' }) => (
  <picture className="brand-artwork">
    <source media="(max-width: 560px)" srcSet={`/brand/mark-${surface === 'light' ? 'dark-on-light' : 'light-on-dark'}.png`} />
    <img
      alt=""
      height="724"
      src={`/brand/wordmark-${surface === 'light' ? 'dark-on-light' : 'light-on-dark'}.png`}
      width="2172"
    />
  </picture>
);

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Lexync home">
          <BrandArtwork surface="light" />
        </a>
        <p>Private language learning</p>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Your language, in context</p>
          <h1>Keep the words<br />you choose.</h1>
          <p className="hero-intro">
            Capture the language that matters while you browse. Lexync keeps it synchronized, personal, and ready to practise on your iPhone—even when you are offline.
          </p>
          <a className="text-link" href="#how-it-works">See how the loop works <Arrow /></a>
        </div>

        <div className="capture-scene" aria-label="An example of deliberate word capture">
          <div className="browser-bar">
            <span /><span /><span />
            <p>field notes · italian</p>
          </div>
          <div className="reading-card">
            <p className="reading-label">A passage worth keeping</p>
            <p className="reading-copy">
              Camminava piano, lasciando che la città gli venisse <mark>incontro</mark>.
            </p>
          </div>
          <div className="save-card">
            <div className="save-card-top">
              <span>Expression</span>
              <span className="saved-state">Ready to save</span>
            </div>
            <strong>incontro</strong>
            <p>meeting · encounter</p>
            <div className="save-meta">
              <span>Italian → English</span>
              <span>1 example</span>
            </div>
          </div>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
        </div>
      </section>

      <section className="principles" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow"><span /> One continuous loop</p>
          <h2>A quieter way to build fluency.</h2>
          <p>No feeds. No bulk imports. Just the language you notice, carried into practice.</p>
        </div>

        <div className="principle-grid">
          <article>
            <p className="step-number">01</p>
            <h3>Capture with intention</h3>
            <p>Save a word or exact phrase from the web only when you choose to. Keep its translation and the sentence that made it meaningful.</p>
          </article>
          <article>
            <p className="step-number">02</p>
            <h3>Stay in sync</h3>
            <p>Your private vocabulary moves from the Chromium extension to your iPhone, preserving the Expressions, meanings, and Examples you selected.</p>
          </article>
          <article>
            <p className="step-number">03</p>
            <h3>Practice offline</h3>
            <p>Review downloaded lessons wherever you are. Your iPhone keeps progress durable and synchronizes it when connectivity returns.</p>
          </article>
        </div>
      </section>

      <section className="surfaces">
        <div className="surfaces-heading">
          <p className="eyebrow light"><span /> Each tool has one job</p>
          <h2>From noticing<br />to knowing.</h2>
        </div>

        <div className="surface-list">
          <article>
            <div className="surface-icon"><ExtensionMark /></div>
            <div>
              <p className="surface-kicker">Where language finds you</p>
              <h3>Chromium extension</h3>
              <p>Capture deliberately as you browse and look up the Expressions you already know. Site access stays on demand.</p>
            </div>
          </article>
          <article>
            <div className="surface-icon"><PhoneMark /></div>
            <div>
              <p className="surface-kicker">Where learning continues</p>
              <h3>iPhone app</h3>
              <p>Carry your synchronized library into focused review and Free Practice, with downloaded lessons available offline.</p>
            </div>
          </article>
        </div>

        <p className="web-boundary">This website is the front door, not another study surface.</p>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top" aria-label="Back to the top">
          <BrandArtwork surface="dark" />
        </a>
        <p>Notice it. Keep it. Know it.</p>
      </footer>
    </main>
  );
}
