import React from 'react'

export function Hotkey({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 5px', borderRadius: 3,
      background: 'var(--bg-3)', border: '1px solid var(--border-1)',
      color: 'var(--text-3)', letterSpacing: '.04em',
    }}>
      {children}
    </kbd>
  )
}
