import React from 'react'
import { Icon, type IconName } from './Icon'

type BtnVariant = 'primary' | 'pixie' | 'secondary' | 'ghost' | 'danger'
type BtnSize    = 'sm' | 'md' | 'lg'

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  icon?: IconName
  kbd?: string
}

const VARIANT_STYLES: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: 'linear-gradient(180deg, var(--accent-2), var(--accent-3))', color: '#fff', border: '1px solid var(--accent-3)', boxShadow: '0 0 24px -6px rgba(var(--accent-2-rgb),.6), inset 0 1px 0 rgba(255,255,255,.18)' },
  pixie:     { background: 'var(--accent-2)', color: '#fff', border: '1px solid var(--accent-3)', boxShadow: '0 0 24px -8px rgba(var(--accent-2-rgb),.6)' },
  secondary: { background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border-1)' },
  ghost:     { background: 'transparent', color: 'var(--text-2)', border: '1px solid transparent' },
  danger:    { background: 'rgba(255,77,109,.14)', color: 'var(--danger)', border: '1px solid rgba(255,77,109,.4)' },
}

const SIZE_STYLES: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 12, borderRadius: 6, height: 26 },
  md: { padding: '6px 14px', fontSize: 13, borderRadius: 8, height: 32 },
  lg: { padding: '10px 18px', fontSize: 14, borderRadius: 10, height: 40 },
}

export function Btn({ variant = 'secondary', size = 'md', icon, kbd, children, style, ...rest }: BtnProps) {
  const iconSize = size === 'sm' ? 12 : 14
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '.02em',
        cursor: 'pointer', whiteSpace: 'nowrap',
        ...VARIANT_STYLES[variant], ...SIZE_STYLES[size], ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {kbd && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: .65, marginLeft: 4, background: 'rgba(0,0,0,.25)', padding: '1px 5px', borderRadius: 3 }}>
          {kbd}
        </span>
      )}
    </button>
  )
}
