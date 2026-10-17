export function BrandArtwork({ background }: { background: 'dark' | 'light' }) {
  if (background === 'dark') {
    return (
      <picture className="brand-artwork brand-artwork-fixed" data-ui="visual-primitive">
        <source media="(max-width: 560px)" srcSet="/brand/mark-light-on-dark.png" />
        <img alt="" height="724" src="/brand/wordmark-light-on-dark.png" width="2172" />
      </picture>
    );
  }

  return (
    <picture className="brand-artwork" data-ui="visual-primitive">
      <source media="(max-width: 560px) and (prefers-color-scheme: dark)" srcSet="/brand/mark-light-on-dark.png" />
      <source media="(max-width: 560px)" srcSet="/brand/mark-dark-on-light.png" />
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/wordmark-light-on-dark.png" />
      <img alt="" height="724" src="/brand/wordmark-dark-on-light.png" width="2172" />
    </picture>
  );
}

export function BrandMark({ alt = '', className, size }: { alt?: string; className?: string; size: number }) {
  return (
    <picture className={className ? `brand-mark ${className}` : 'brand-mark'}>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/mark-light-on-dark.png" />
      <img alt={alt} height={size} src="/brand/mark-dark-on-light.png" width={size} />
    </picture>
  );
}
