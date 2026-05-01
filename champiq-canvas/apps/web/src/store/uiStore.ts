import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RailTab = 'chat' | 'mail' | 'graph'
export type AccentPreset = 'violet' | 'mint' | 'coral' | 'sun' | 'sky'
export type DensityPreset = 'compact' | 'cozy' | 'comfortable'
export type VoicePreset = 'Friendly' | 'Crisp' | 'Quirky' | 'Pro'
export type RailStyle = 'classic' | 'glyph'
export type CloakColor = '#0EA968' | '#E63A87' | '#1E5FCB' | '#2A2F44'
export type AppView = 'hub' | 'cockpit'
export type HubView = 'home' | 'stages' | 'bullpen'

interface UIStore {
  // App-level routing
  appView: AppView
  setAppView: (v: AppView) => void
  activeCanvasId: string | null
  setActiveCanvas: (id: string | null) => void

  // Hub sub-view
  hubView: HubView
  setHubView: (v: HubView) => void

  // First-run onboarding
  isFirstRun: boolean
  setIsFirstRun: (v: boolean) => void

  // Dark/light theme
  isDark: boolean
  setIsDark: (v: boolean) => void

  // Rail navigation
  activeRail: RailTab
  setActiveRail: (tab: RailTab) => void

  // Tweaks / appearance
  accent: AccentPreset
  setAccent: (a: AccentPreset) => void

  density: DensityPreset
  setDensity: (d: DensityPreset) => void

  cloak: CloakColor
  setCloak: (c: CloakColor) => void

  voice: VoicePreset
  setVoice: (v: VoicePreset) => void

  railStyle: RailStyle
  setRailStyle: (s: RailStyle) => void

  // Left panel visibility + resizable width
  leftPanelVisible: boolean
  setLeftPanelVisible: (v: boolean) => void
  leftPanelWidth: number
  setLeftPanelWidth: (w: number) => void

  // Logs strip resizable height
  logsHeight: number
  setLogsHeight: (h: number) => void

  // Panels
  logsOpen: boolean
  setLogsOpen: (open: boolean) => void

  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void

  settingsTab: 'credentials' | 'theme' | 'account'
  setSettingsTab: (t: 'credentials' | 'theme' | 'account') => void

  // NodeSheet
  nodeSheetId: string | null
  setNodeSheet: (id: string | null) => void

  // Node palette (collapsible)
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void

  // Command palette
  cmdOpen: boolean
  setCmdOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      appView: 'hub',
      setAppView: (v) => set({ appView: v }),
      activeCanvasId: null,
      setActiveCanvas: (id) => set({ activeCanvasId: id }),

      hubView: 'home',
      setHubView: (v) => set({ hubView: v }),

      isFirstRun: true,
      setIsFirstRun: (v) => set({ isFirstRun: v }),

      isDark: true,
      setIsDark: (v) => set({ isDark: v }),

      activeRail: 'chat',
      setActiveRail: (tab) => set({ activeRail: tab }),

      accent: 'violet',
      setAccent: (a) => set({ accent: a }),

      density: 'comfortable',
      setDensity: (d) => set({ density: d }),

      cloak: '#1E5FCB',
      setCloak: (c) => set({ cloak: c }),

      voice: 'Friendly',
      setVoice: (v) => set({ voice: v }),

      railStyle: 'glyph',
      setRailStyle: (s) => set({ railStyle: s }),

      leftPanelVisible: true,
      setLeftPanelVisible: (v) => set({ leftPanelVisible: v }),
      leftPanelWidth: 360,
      setLeftPanelWidth: (w) => set({ leftPanelWidth: w }),
      logsHeight: 200,
      setLogsHeight: (h) => set({ logsHeight: h }),

      logsOpen: false,
      setLogsOpen: (open) => set({ logsOpen: open }),

      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      settingsTab: 'credentials',
      setSettingsTab: (t) => set({ settingsTab: t }),

      nodeSheetId: null,
      setNodeSheet: (id) => set({ nodeSheetId: id }),

      paletteOpen: true,
      setPaletteOpen: (open) => set({ paletteOpen: open }),

      cmdOpen: false,
      setCmdOpen: (open) => set({ cmdOpen: open }),
    }),
    {
      name: 'champiq-ui',
      partialize: (s) => ({
        accent: s.accent,
        density: s.density,
        cloak: s.cloak,
        voice: s.voice,
        railStyle: s.railStyle,
        isFirstRun: s.isFirstRun,
        isDark: s.isDark,
        leftPanelVisible: s.leftPanelVisible,
        leftPanelWidth: s.leftPanelWidth,
        logsHeight: s.logsHeight,
      }),
    }
  )
)
