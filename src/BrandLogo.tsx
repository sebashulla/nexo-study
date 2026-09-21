type BrandLogoProps = {
  compact?: boolean
  iconOnly?: boolean
  className?: string
}

export function BrandLogo({ compact = false, iconOnly = false, className = '' }: BrandLogoProps) {
  if (iconOnly) {
    return <img className={`brand-icon-image ${compact ? 'compact' : ''} ${className}`.trim()} src="/brand/icon-nexo.png" alt="Nexo Study" />
  }

  return <div className={`brand-lockup ${compact ? 'compact' : ''} ${className}`.trim()}>
    {compact && <img className="brand-icon-image" src="/brand/icon-nexo.png" alt="" aria-hidden="true" />}
    <img className="brand-wordmark-image" src="/brand/logo-nexo.png" alt="Nexo Study" />
  </div>
}
