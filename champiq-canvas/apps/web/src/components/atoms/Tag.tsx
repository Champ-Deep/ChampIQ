import React from 'react'

interface TagProps { children: React.ReactNode; color?: string; filled?: boolean }

export function Tag({ children, color = 'var(--accent-2)', filled = false }: TagProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
      textTransform: 'uppercase', fontWeight: 600,
      background: filled ? color : `color-mix(in oklch, ${color} 16%, transparent)`,
      color: filled ? 'var(--bg-0)' : color,
      border: filled ? 'none' : `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
    }}>
      {children}
    </span>
  )
}
