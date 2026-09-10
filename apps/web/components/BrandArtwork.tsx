export function BrandArtwork({ background }: { background: 'dark' | 'light' }) {
  const artwork = background === 'dark' ? 'light-on-dark' : 'dark-on-light';

  return (
    <picture className="brand-artwork">
      <source media="(max-width: 560px)" srcSet={`/brand/mark-${artwork}.png`} />
      <img alt="" height="724" src={`/brand/wordmark-${artwork}.png`} width="2172" />
    </picture>
  );
}
