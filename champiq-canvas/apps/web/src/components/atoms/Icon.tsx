import React from 'react'

export type IconName =
  | 'chat' | 'templates' | 'mail' | 'graph' | 'settings' | 'play' | 'save'
  | 'chevDown' | 'chevRight' | 'chevLeft' | 'chevUp' | 'plus' | 'x' | 'sparkle'
  | 'bolt' | 'search' | 'send' | 'key' | 'palette' | 'user' | 'file' | 'list'
  | 'play_node' | 'branch' | 'loop' | 'cmd' | 'terminal' | 'check' | 'alert'
  | 'eye' | 'layers' | 'folder' | 'tag' | 'code' | 'timer' | 'db' | 'refresh'
  | 'moon' | 'home' | 'clock' | 'grid' | 'drag' | 'arrow_right' | 'star'
  | 'voice' | 'cron' | 'webhook' | 'set' | 'if_node' | 'spinner' | 'pause'
  | 'archive' | 'minus'

interface IconProps {
  name: IconName
  size?: number
  stroke?: string
  strokeWidth?: number
  className?: string
}

const PATHS: Record<IconName, React.ReactNode> = {
  chat:       <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  templates:  <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  mail:       <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
  graph:      <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.6 7.4l3 8.4M16.4 7.4l-3 8.4M8 6h8"/></>,
  settings:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9 1.7 1.7 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  play:       <polygon points="5 3 19 12 5 21 5 3"/>,
  save:       <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
  chevDown:   <polyline points="6 9 12 15 18 9"/>,
  chevRight:  <polyline points="9 18 15 12 9 6"/>,
  chevLeft:   <polyline points="15 18 9 12 15 6"/>,
  chevUp:     <polyline points="18 15 12 9 6 15"/>,
  plus:       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  x:          <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  sparkle:    <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>,
  bolt:       <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  search:     <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  send:       <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  key:        <><circle cx="7" cy="14" r="4"/><path d="m11 11 9-9 3 3-2 2 2 2-2 2-2-2-3 3"/></>,
  palette:    <><circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/><circle cx="16.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="14" cy="15.5" r="1.2" fill="currentColor"/></>,
  user:       <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  file:       <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  list:       <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
  play_node:  <><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></>,
  branch:     <><path d="M6 3v18M18 8a4 4 0 0 0-4-4H6"/><circle cx="6" cy="3" r="1.5" fill="currentColor"/><circle cx="18" cy="8" r="1.5" fill="currentColor"/><circle cx="6" cy="21" r="1.5" fill="currentColor"/></>,
  loop:       <><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></>,
  cmd:        <path d="M9 9V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v4m-6 0v6m6-6v6m-6 0H5a3 3 0 1 0 3 3v-3m6 0h4a3 3 0 1 1-3 3v-3"/>,
  terminal:   <><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>,
  check:      <polyline points="20 6 9 17 4 12"/>,
  alert:      <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
  eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  layers:     <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  folder:     <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>,
  tag:        <><path d="M20 12 12 20l-9-9V3h8z"/><circle cx="7" cy="7" r="1.5"/></>,
  code:       <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  timer:      <><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14 15"/><line x1="9" y1="2" x2="15" y2="2"/></>,
  db:         <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  refresh:    <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9A9 9 0 0 1 18 5l5 5M1 14l5 5a9 9 0 0 0 14.5-2.5"/></>,
  moon:       <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
  home:       <><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></>,
  clock:      <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
  grid:       <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  drag:       <><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></>,
  arrow_right:<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 5 19 12 13 19"/></>,
  star:       <polygon points="12 2 15 9 22 9 17 14 19 22 12 17 5 22 7 14 2 9 9 9 12 2"/>,
  voice:      <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></>,
  cron:       <><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><polyline points="9 2 15 2 12 5"/></>,
  webhook:    <><path d="M9 9a3 3 0 1 1 4 2.7L7 18"/><path d="M16 13a3 3 0 1 1-3 3h-7"/><path d="M12 6a3 3 0 1 1 3 3v0"/></>,
  set:        <><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="14" height="4" rx="1"/><rect x="3" y="16" width="10" height="4" rx="1"/></>,
  if_node:    <><path d="M12 3v6"/><path d="M12 9 7 16h10z"/><path d="M7 16v3M17 16v3"/></>,
  spinner:    <path d="M12 3a9 9 0 1 1-9 9"/>,
  pause:      <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
  archive:    <><path d="M3 6h18"/><rect x="3" y="6" width="18" height="14" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></>,
  minus:      <line x1="5" y1="12" x2="19" y2="12"/>,
}

export function Icon({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.6, className }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={stroke} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
