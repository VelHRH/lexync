import Image from 'next/image';

type Variant = 'dark-on-light' | 'light-on-dark';

function Wordmark({ variant, themed }: { variant: Variant; themed?: 'light' | 'dark' }) {
  return (
    <picture className="brand-artwork" data-theme-artwork={themed} data-ui="visual-primitive">
      <source media="(max-width: 560px)" srcSet={`/brand/mark-${variant}.png`} />
      <img alt="" height="724" src={`/brand/wordmark-${variant}.png`} width="2172" />
    </picture>
  );
}

export function BrandArtwork({ background }: { background: 'dark' | 'light' }) {
  if (background === 'dark') return <Wordmark variant="light-on-dark" />;

  return <>
    <Wordmark themed="light" variant="dark-on-light" />
    <Wordmark themed="dark" variant="light-on-dark" />
  </>;
}

export function BrandMark({ alt = '', className, size }: { alt?: string; className?: string; size: number }) {
  return <>
    {(['light', 'dark'] as const).map((themed) => <Image
      alt={themed === 'light' ? alt : ''}
      className={className}
      data-theme-artwork={themed}
      height={1254}
      key={themed}
      src={themed === 'light' ? '/brand/mark-dark-on-light.png' : '/brand/mark-light-on-dark.png'}
      style={{ width: `${size}px`, height: `${size}px` }}
      unoptimized
      width={1254}
    />)}
  </>;
}
