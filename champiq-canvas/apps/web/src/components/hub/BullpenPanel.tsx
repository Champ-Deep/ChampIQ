import { useState } from 'react'
import { Search, Upload, Plus, X, Users, Sparkles, Mail, Tag, Trash2 } from 'lucide-react'
import { Pixie } from '@/components/pixie/Pixie'
import { useUIStore } from '@/store/uiStore'

interface Prospect {
  id: number
  name: string
  company: string
  role: string
  email: string
  status: 'ready' | 'needs_review' | 'invalid' | 'enrolled'
  score: number
  signal: string
  seq: string | null
}

const SAMPLE_PROSPECTS: Prospect[] = [
  { id: 1, name: 'Alex Chen',    company: 'Vercel',   role: 'Dir. Sales Ops',  email: 'alex@vercel.com',  status: 'ready',        score: 92, signal: 'Hiring SDR',  seq: 'Q2 Cold SaaS' },
  { id: 2, name: 'Jay Patel',    company: 'Linear',   role: 'Head of RevOps',  email: 'jay@linear.app',   status: 'ready',        score: 78, signal: 'Series B',    seq: 'Q2 Cold SaaS' },
  { id: 3, name: 'Sam Rivera',   company: 'Retool',   role: 'VP Sales',        email: 'sam@retool.com',   status: 'needs_review', score: 65, signal: 'New VP',      seq: null },
  { id: 4, name: 'Priya Singh',  company: 'Stripe',   role: 'Sales Ops Lead',  email: 'priya@stripe.com', status: 'ready',        score: 71, signal: 'Hiring SDR',  seq: null },
  { id: 5, name: 'Mike Torres',  company: 'Notion',   role: 'Dir. Sales Eng',  email: 'mike@notion.so',   status: 'invalid',      score: 0,  signal: '—',           seq: null },
  { id: 6, name: 'Lea Kim',      company: 'Figma',    role: 'RevOps Manager',  email: 'lea@figma.com',    status: 'ready',        score: 84, signal: 'Series C',    seq: 'Warm follow-up' },
  { id: 7, name: 'Dan Osei',     company: 'Supabase', role: 'VP GTM',          email: 'dan@supabase.io',  status: 'needs_review', score: 58, signal: 'Hiring',      seq: null },
]

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  ready:        { color: 'var(--success)',  label: 'Ready' },
  needs_review: { color: 'var(--warn)',     label: 'Review' },
  invalid:      { color: 'var(--danger)',   label: 'Invalid' },
  enrolled:     { color: 'var(--info)',     label: 'Enrolled' },
}

export function BullpenPanel() {
  const [prospects] = useState<Prospect[]>(SAMPLE_PROSPECTS)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const { cloak, accent } = useUIStore()

  const filtered = prospects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.company.toLowerCase().includes(search.toLowerCase())
  )

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((p) => p.id)))
  }

  function toggle(id: number) {
    setSelected((s) => {
      const ns = new Set(s)
      ns.has(id) ? ns.delete(id) : ns.add(id)
      return ns
    })
  }

  const statusCounts = {
    ready: filtered.filter((p) => p.status === 'ready').length,
    needs_review: filtered.filter((p) => p.status === 'needs_review').length,
    invalid: filtered.filter((p) => p.status === 'invalid').length,
    enrolled: filtered.filter((p) => p.seq).length,
  }

  return (
    <div data-accent={accent} style={{
      width: '100%', flex: 1, background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'var(--font-body)', color: 'var(--text-1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 52, flexShrink: 0,
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in oklch, var(--accent-2) 18%, var(--bg-0))', color: 'var(--accent-2)', display: 'grid', placeItems: 'center' }}>
            <Users size={14} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>Bullpen</span>
          <span style={{ background: 'rgba(var(--accent-2-rgb),.12)', border: '1px solid rgba(var(--accent-2-rgb),.25)', borderRadius: 20, padding: '1px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-1)', letterSpacing: '.1em' }}>
            {prospects.length} prospects
          </span>
        </div>
        <span style={{ flex: 1 }} />
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prospects…"
            style={{
              paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
              background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7,
              color: 'var(--text-1)', fontFamily: 'var(--font-body)', fontSize: 12,
              outline: 'none', width: 200,
            }}
          />
        </div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
          <Upload size={12} /> Import CSV
        </button>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'var(--accent-2)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={12} /> Add prospect
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Pixie tip */}
        <div style={{ background: 'rgba(var(--accent-2-rgb),.07)', border: '1px solid rgba(var(--accent-2-rgb),.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Pixie pose="read" size={36} cloak={cloak} ambient={false} />
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, alignSelf: 'center' }}>
            {statusCounts.needs_review > 0
              ? `${statusCounts.needs_review} prospects need review — missing role or invalid email. I can auto-enrich from ChampGraph.`
              : `${statusCounts.ready} prospects ready to enroll. ${statusCounts.enrolled} already in sequences.`
            }
          </div>
          {statusCounts.needs_review > 0 && (
            <button style={{ flexShrink: 0, padding: '5px 11px', background: 'var(--accent-2)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
              Enrich all
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            background: 'rgba(var(--accent-2-rgb),.08)', border: '1px solid rgba(var(--accent-2-rgb),.25)',
            borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
            animation: 'bubble-in 180ms var(--ease-spring)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--accent-1)' }}>
              {selected.size} selected
            </span>
            <div style={{ flex: 1, display: 'flex', gap: 8 }}>
              <BulkBtn icon={<Mail size={12} />}>Enroll in sequence</BulkBtn>
              <BulkBtn icon={<Sparkles size={12} />}>Enrich with Pixie</BulkBtn>
              <BulkBtn icon={<Tag size={12} />}>Tag</BulkBtn>
              <BulkBtn icon={<Trash2 size={12} />} danger>Remove</BulkBtn>
            </div>
            <button onClick={() => setSelected(new Set())} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 4 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Ready', count: statusCounts.ready, color: 'var(--success)' },
            { label: 'Review', count: statusCounts.needs_review, color: 'var(--warn)' },
            { label: 'Invalid', count: statusCounts.invalid, color: 'var(--danger)' },
            { label: 'Enrolled', count: statusCounts.enrolled, color: 'var(--info)' },
          ].map((chip) => (
            <div key={chip.label} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
              background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 20,
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', cursor: 'pointer',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color }} />
              <span style={{ color: 'var(--text-2)' }}>{chip.label}</span>
              <span style={{ color: chip.color, fontWeight: 700 }}>{chip.count}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '36px 1fr 150px 130px 90px 80px',
            padding: '8px 16px', borderBottom: '1px solid var(--border-1)',
            background: 'var(--bg-0)',
          }}>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <Checkbox checked={allSelected} onChange={toggleAll} />
            </div>
            {['Prospect', 'Company / Role', 'Signal', 'Status', 'Score'].map((h) => (
              <div key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-4)', display: 'flex', alignItems: 'center' }}>{h}</div>
            ))}
          </div>

          {filtered.map((p, i) => {
            const sc = STATUS_STYLES[p.status]
            const isSelected = selected.has(p.id)
            return (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '36px 1fr 150px 130px 90px 80px',
                padding: '11px 16px', alignItems: 'center',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border-1)' : 'none',
                background: isSelected ? 'rgba(var(--accent-2-rgb),.06)' : 'transparent',
                cursor: 'pointer', transition: 'background .14s',
              }}>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <Checkbox checked={isSelected} onChange={() => toggle(p.id)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 15, flexShrink: 0,
                    background: 'color-mix(in oklch, var(--accent-2) 18%, var(--bg-3))',
                    display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--accent-2)',
                  }}>{p.name[0]}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{p.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{p.email}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{p.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role}</div>
                </div>
                <div>
                  {p.signal !== '—' && (
                    <span style={{
                      fontSize: 10.5, padding: '2px 7px', borderRadius: 4,
                      background: 'rgba(var(--accent-2-rgb),.1)', border: '1px solid rgba(var(--accent-2-rgb),.2)',
                      color: 'var(--accent-1)', fontFamily: 'var(--font-mono)',
                    }}>{p.signal}</span>
                  )}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20,
                  background: `color-mix(in oklch, ${sc.color} 14%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${sc.color} 30%, transparent)`,
                  fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: sc.color,
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: sc.color }} />
                  {sc.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.score}%`, borderRadius: 2, background: p.score > 80 ? 'var(--success)' : p.score > 50 ? 'var(--accent-2)' : p.score > 0 ? 'var(--warn)' : 'var(--danger)' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', width: 22, textAlign: 'right' }}>{p.score}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      style={{
        width: 16, height: 16, borderRadius: 4,
        background: checked ? 'var(--accent-2)' : 'transparent',
        border: checked ? '1.5px solid var(--accent-2)' : '1.5px solid var(--border-2)',
        display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .15s', flexShrink: 0,
      }}
    >
      {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
    </button>
  )
}

function BulkBtn({ icon, children, danger }: { icon: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px',
      background: danger ? 'rgba(255,77,109,.1)' : 'var(--bg-2)',
      border: `1px solid ${danger ? 'rgba(255,77,109,.3)' : 'var(--border-1)'}`,
      borderRadius: 7, color: danger ? 'var(--danger)' : 'var(--text-2)',
      fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    }}>
      {icon} {children}
    </button>
  )
}
