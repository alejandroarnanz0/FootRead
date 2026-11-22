import { useState } from 'react';

function initials(name) {
  const words = name.trim().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase('es') || '–';
}

function ImageFrame({ asset, name, alt, fallbackLabel, className, decorative, eager }) {
  const [status, setStatus] = useState(asset?.url ? 'loading' : 'missing');
  const label = status === 'loading' ? `Cargando imagen de ${name}` : fallbackLabel;
  return (
    <span className={className} data-image-status={status} aria-hidden={decorative || undefined}>
      {status !== 'ready' && <span role="img" aria-label={label}>{initials(name)}</span>}
      {(status === 'loading' || status === 'ready') && (
        <img
          src={asset.url}
          alt={decorative ? '' : alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          aria-hidden={status !== 'ready'}
          style={asset.position ? { objectPosition: asset.position } : undefined}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
        />
      )}
    </span>
  );
}

export default function IdentityImage(props) {
  return <ImageFrame key={props.asset?.url ?? ''} {...props} className={`identity-image ${props.className ?? ''}`} />;
}
