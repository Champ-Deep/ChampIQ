import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { Settings2, X } from 'lucide-react'
import type { AccentPreset, DensityPreset, VoicePreset, RailStyle, CloakColor } from '@/store/uiStore'

export function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const {
    accent, setAccent,
    density, setDensity,
    cloak, setCloak,
    voice, setVoice,
    railStyle, setRailStyle,
  } = useUIStore()

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Tweaks"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 50,
          width: 40, height: 40, borderRadius: 12,
          background: 'var(--bg-2)', border: '1px solid var(--border-1)',
          color: 'var(--text-3)', display: 'grid', placeItems: 'center',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,.4)',
          transition: 'all .15s',
        }}
        onMouseEnter={e => {
          const t = e.currentTarget
          t.style.color = 'var(--accent-1)'
          t.style.borderColor = 'rgba(var(--accent-2-rgb),.35)'
        }}
        onMouseLeave={e => {
          const t = e.currentTarget
          t.style.color = 'var(--text-3)'
          t.style.borderColor = 'var(--border-1)'
        }}
      >
        <Settings2 size={16} />
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 70, right: 20, zIndex: 60,
          width: 260,
          background: 'var(--bg-1)', border: '1px solid var(--border-1)',
          borderRadius: 14, boxShadow: '0 16px 60px rgba(0,0,0,.6)',
          animation: 'bubble-in 200ms var(--ease-spring) both',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border-1)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
              Tweaks
            </span>
            <button onClick={() => setOpen(false)} style={{
              width: 24, height: 24, display: 'grid', placeItems: 'center',
              background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer',
            }}><X size={14}/></button>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Accent */}
            <TweakSection label="Accent">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['violet','mint','coral','sun','sky'] as AccentPreset[]).map((a) => {
                  const hex: Record<AccentPreset, string> = { violet: '#7C5CFF', mint: '#00E5C7', coral: '#FF7A59', sun: '#FFC23F', sky: '#5BC0FF' }
                  return (
                    <button key={a} onClick={() => setAccent(a)} style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: hex[a], border: accent === a ? '2px solid white' : '2px solid transparent',
                      cursor: 'pointer', transition: 'transform .1s',
                    }} title={a} />
                  )
                })}
              </div>
            </TweakSection>

            {/* Density */}
            <TweakSection label="Density">
              <RadioGroup
                options={['compact', 'cozy', 'comfortable'] as DensityPreset[]}
                value={density}
                onChange={setDensity}
              />
            </TweakSection>

            {/* Pixie cloak */}
            <TweakSection label="Pixie cloak">
              <div style={{ display: 'flex', gap: 6 }}>
                {([['Emerald','#0EA968'],['Magenta','#E63A87'],['Cobalt','#1E5FCB'],['Charcoal','#2A2F44']] as [string, CloakColor][]).map(([name, hex]) => (
                  <button key={hex} onClick={() => setCloak(hex)} title={name} style={{
                    width: 26, height: 26, borderRadius: 6, background: hex,
                    border: cloak === hex ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                  }}/>
                ))}
              </div>
            </TweakSection>

            {/* Voice */}
            <TweakSection label="Voice">
              <RadioGroup
                options={['Friendly','Crisp','Quirky','Pro'] as VoicePreset[]}
                value={voice}
                onChange={setVoice}
              />
            </TweakSection>

            {/* Rail style */}
            <TweakSection label="Rail">
              <RadioGroup
                options={['classic','glyph'] as RailStyle[]}
                value={railStyle}
                onChange={setRailStyle}
              />
            </TweakSection>
          </div>
        </div>
      )}
    </>
  )
}

function TweakSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function RadioGroup<T extends string>({ options, value, onChange }: {
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '3px 10px', borderRadius: 6, fontSize: 11,
          fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer',
          background: value === o ? 'rgba(var(--accent-2-rgb),.16)' : 'var(--bg-2)',
          border: value === o ? '1px solid rgba(var(--accent-2-rgb),.35)' : '1px solid var(--border-1)',
          color: value === o ? 'var(--accent-1)' : 'var(--text-3)',
          textTransform: 'capitalize',
        }}>{o}</button>
      ))}
    </div>
  )
}
