/**
 * Top-level view router.
 *
 * Why not react-router? The app is single-page with two surfaces (canvas +
 * settings). A 6-line zustand store is cheaper to read and reason about than
 * adding a routing dep, and avoids a build/test/deploy hit for one toggle.
 * If we add a third surface this gets promoted to a real router.
 */
import { create } from 'zustand'

export type View = 'canvas' | 'settings'

interface ViewStore {
  view: View
  setView: (v: View) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  view: 'canvas',
  setView: (v) => set({ view: v }),
}))
