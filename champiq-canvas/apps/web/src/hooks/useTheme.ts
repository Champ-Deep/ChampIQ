import { useState, useEffect } from 'react'

/**
 * Manages dark/light theme.
 * Persists to localStorage under 'champiq:theme'.
 * Applies/removes the 'dark' class on <html> so Tailwind and CSS variables respond.
 * Default: dark.
 */
export function useTheme() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('champiq:theme') !== 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('champiq:theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}
