/**
 * Full-page Settings route.
 *
 * Hosts:
 *   1. Email Engine switcher (Emelia ↔ ChampMail-native), with multi-Emelia
 *      support — multiple credential rows of type="champmail" can coexist;
 *      one is marked the default.
 *   2. Credentials manager — reuses <CredentialsPanel /> verbatim. Same data,
 *      same component, two surfaces (canvas right-rail + this page). Avoids
 *      divergence and costs us nothing.
 *
 * Deliberately NOT here:
 *   - ChampVoice management UI (stays on the canvas).
 *   - Anything that exists on the canvas right-rail today, beyond the
 *     credentials list. We add, we don't move.
 */
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CredentialsPanel } from '@/components/layout/CredentialsPanel'
import { useViewStore } from '@/store/viewStore'
import { EmailEngineSection } from './EmailEngineSection'

export function SettingsPage() {
  const setView = useViewStore((s) => s.setView)

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}
    >
      <header
        className="flex items-center gap-3 px-6 py-3 border-b"
        style={{ borderColor: 'var(--border-1)' }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('canvas')}
          aria-label="Back to canvas"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to canvas
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 space-y-10">
          <EmailEngineSection />

          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>
              Credentials
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
              Manage credentials used by canvas nodes. Same list as the canvas
              right rail — changes here are visible there.
            </p>
            <div
              className="rounded border"
              style={{ borderColor: 'var(--border-1)', background: 'var(--bg-1)' }}
            >
              {/* Reused as-is. The component renders its own list/add UI. */}
              <CredentialsPanel />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
