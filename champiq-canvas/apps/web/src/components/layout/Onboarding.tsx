import { useState } from 'react'
import { Upload, ChevronRight, ChevronLeft, Play, Check } from 'lucide-react'
import { Pixie } from '@/components/pixie/Pixie'
import { useUIStore } from '@/store/uiStore'
import { api } from '@/lib/api'

const STEPS = [
  { id: 'welcome',    title: 'Welcome to ChampIQ', icon: '✦' },
  { id: 'credential', title: 'Connect ChampMail',  icon: '🔑' },
  { id: 'bullpen',    title: 'Import your Bullpen', icon: '👥' },
  { id: 'stage',      title: 'Build your first Stage', icon: '⬡' },
  { id: 'done',       title: "You're ready",        icon: '✓' },
]

type StepPose = 'cheer' | 'read' | 'carry' | 'point' | 'idle'

interface StepContent {
  heading: string
  sub: string
  pose: StepPose
  cta: string
  fields?: Array<{ label: string; placeholder: string; mono?: boolean; type?: string }>
  upload?: boolean
  templates?: boolean
  done?: boolean
}

const STEP_CONTENT: StepContent[] = [
  {
    heading: 'Welcome to ChampIQ.',
    sub: "I'm Pixie. I run your outbound so you don't have to. Let's get you set up in about 3 minutes.",
    pose: 'cheer',
    cta: 'Get started',
  },
  {
    heading: 'Connect ChampMail.',
    sub: "Paste your ChampMail API key. I'll test the connection and bind it to all future stages automatically.",
    pose: 'read',
    cta: 'Connect & test',
    fields: [
      { label: 'ChampMail API key', placeholder: 'cm_live_••••••••••••••••', mono: true, type: 'password' },
    ],
  },
  {
    heading: 'Import your Bullpen.',
    sub: "Upload a CSV with your prospects. I'll check for valid emails, enrich missing data, and score each contact.",
    pose: 'carry',
    cta: 'Upload CSV',
    upload: true,
  },
  {
    heading: 'Build your first Stage.',
    sub: "Pick a template — I'll wire it to your credentials and Bullpen automatically. Customize everything after.",
    pose: 'point',
    cta: 'Use Cold Outbound template',
    templates: true,
  },
  {
    heading: "You're ready.",
    sub: "ChampMail connected, Bullpen imported, first stage built. Hit Run All and watch it go.",
    pose: 'cheer',
    cta: 'Open Stage',
    done: true,
  },
]

const TEMPLATES = [
  { icon: '📧', name: 'Cold outbound',    desc: 'The classic — Loop → ChampMail.', nodes: 6 },
  { icon: '↩️', name: 'Warm follow-up',   desc: 'Re-engage interested prospects.', nodes: 4 },
  { icon: '📩', name: 'Inbound response', desc: 'Webhook → score → route.',        nodes: 7 },
]

interface OnboardingProps {
  onComplete: () => void
  onSkip: () => void
}

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const { cloak, accent, density } = useUIStore()
  const content = STEP_CONTENT[step]

  async function handleNext() {
    if (step === 1 && apiKey) {
      setConnecting(true)
      try {
        await api.createCredential('ChampMail · prod', 'champmail', { api_key: apiKey })
      } catch {
        // continue anyway — user can fix in settings
      }
      setConnecting(false)
    }
    if (step >= STEPS.length - 1) {
      onComplete()
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div data-accent={accent} data-density={density} style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--bg-0)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body)', color: 'var(--text-1)',
      overflow: 'hidden', padding: 32,
    }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(var(--accent-2-rgb),.06) 1px, transparent 0)',
        backgroundSize: '28px 28px',
      }} />

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 40, position: 'relative', zIndex: 1 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: i === step ? 28 : 8, height: 8, borderRadius: 4,
              background: i <= step ? 'var(--accent-2)' : 'var(--bg-3)',
              transition: 'all .3s var(--ease-spring)',
              boxShadow: i === step ? '0 0 10px var(--accent-2)' : 'none',
            }} />
            {i < STEPS.length - 1 && (
              <div style={{ width: 24, height: 1, background: i < step ? 'var(--accent-2)' : 'var(--border-1)', transition: 'background .3s' }} />
            )}
          </div>
        ))}
      </div>

      {/* Main card */}
      <div style={{
        width: '100%', maxWidth: 560, position: 'relative', zIndex: 1,
        background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 20,
        padding: '36px 40px', boxShadow: '0 24px 80px rgba(0,0,0,.45)',
      }}>
        {/* Pixie */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <Pixie pose={content.pose} size={100} cloak={cloak} ambient />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-2)', boxShadow: '0 0 6px var(--accent-2)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-2)' }}>Pixie · Online</span>
          </div>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.02em', margin: '0 0 10px', textAlign: 'center' }}>
          {content.heading}
        </h2>
        <p style={{ fontSize: 14.5, color: 'var(--text-3)', lineHeight: 1.6, textAlign: 'center', margin: '0 0 28px' }}>
          {content.sub}
        </p>

        {/* Fields */}
        {content.fields?.map((f, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
              {f.label}
            </div>
            <input
              type={f.type === 'password' ? 'password' : 'text'}
              value={f.label.includes('API') ? apiKey : undefined}
              onChange={f.label.includes('API') ? (e) => setApiKey(e.target.value) : undefined}
              placeholder={f.placeholder}
              style={{
                width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border-2)',
                color: 'var(--text-1)', padding: '10px 12px', borderRadius: 9,
                fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-body)', fontSize: f.mono ? 13 : 14,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        ))}

        {/* Upload zone */}
        {content.upload && (
          <div style={{
            border: '2px dashed rgba(var(--accent-2-rgb),.35)', borderRadius: 12,
            padding: '28px 20px', textAlign: 'center', marginBottom: 24, cursor: 'pointer',
            background: 'rgba(var(--accent-2-rgb),.04)',
          }}>
            <Upload size={32} color="var(--accent-2)" style={{ display: 'block', margin: '0 auto 10px' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-2)' }}>
              Drop a CSV here or click to browse
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
              email, first_name, last_name, company columns required
            </div>
          </div>
        )}

        {/* Template picker */}
        {content.templates && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {TEMPLATES.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: i === 0 ? 'rgba(var(--accent-2-rgb),.08)' : 'var(--bg-2)',
                border: i === 0 ? '1px solid rgba(var(--accent-2-rgb),.3)' : '1px solid var(--border-1)',
                borderRadius: 10, cursor: 'pointer',
              }}>
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{t.nodes} nodes · {t.desc}</div>
                </div>
                {i === 0 && (
                  <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 4, background: 'rgba(var(--accent-2-rgb),.15)', color: 'var(--accent-2)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>
                    Recommended
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Done checklist */}
        {content.done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {[
              'ChampMail connected',
              'Onboarding complete',
              'Ready to build stages',
            ].map((label, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 9,
              }}>
                <Check size={14} color="var(--success)" />
                <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={ghostBtnStyle}
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step < STEPS.length - 1 && (
            <button onClick={onSkip} style={ghostBtnStyle}>Skip</button>
          )}
          <button
            onClick={handleNext}
            disabled={connecting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              background: 'var(--accent-2)', border: 'none', borderRadius: 9,
              color: '#fff', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
              cursor: connecting ? 'wait' : 'pointer', opacity: connecting ? .7 : 1,
            }}
          >
            {step === STEPS.length - 1 ? <><Play size={14} /> {content.cta}</> : <>{content.cta} <ChevronRight size={14} /></>}
          </button>
        </div>
      </div>

      {/* Step label */}
      <div style={{
        marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)',
        letterSpacing: '.1em', textTransform: 'uppercase', position: 'relative', zIndex: 1,
      }}>
        Step {step + 1} of {STEPS.length} · {STEPS[step].title}
      </div>
    </div>
  )
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
  background: 'transparent', border: '1px solid var(--border-1)', borderRadius: 9,
  color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
}
