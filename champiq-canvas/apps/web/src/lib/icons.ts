/**
 * Central icon registry. Only icons listed here are included in the bundle.
 *
 * NEVER use `import * as LucideIcons from 'lucide-react'` — that pulls in
 * the entire 1500+ icon library (~400 kB extra in the JS bundle) and prevents
 * Vite/Rollup from tree-shaking unused icons.
 *
 * To add a new icon: import it here, add it to the map.
 * Icon names that come from manifest JSON (e.g. "Phone", "mail") are resolved
 * through this map at runtime — unknown names fall back to `Box`.
 */
import {
  // UI controls
  Box,
  X,
  Plus,
  Trash2,
  Save,
  Play,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Key,
  Eye,
  EyeOff,
  // Status / feedback
  Loader2,
  Moon,
  Sun,
  ZoomIn,
  ZoomOut,
  // Chat
  Sparkles,
  Bot,
  User,
  // Tool-specific (referenced by manifest icon field)
  Phone,
  Mail,
  Settings,
  Activity,
  // Graph / general purpose
  Network,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const iconMap: Record<string, LucideIcon> = {
  // exact names from manifest icon fields
  Phone,
  phone: Phone,
  mail: Mail,
  Mail,
  cog: Settings,
  Cog: Settings,
  Settings,
  graph: Network,
  Graph: Network,
  pulse: Activity,
  Pulse: Activity,
  Box,
  box: Box,
  // UI controls
  X,
  Plus,
  Trash2,
  Save,
  Play,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Key,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Sun,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Bot,
  User,
  Network,
  Activity,
}

/** Resolve an icon name string from a manifest to a renderable component. */
export function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return Box
  return iconMap[name] ?? Box
}

export type { LucideIcon }
export {
  Box, X, Plus, Trash2, Save, Play, Send, Copy, Check,
  ChevronDown, ChevronUp, Paperclip, Key, Eye, EyeOff,
  Loader2, Moon, Sun, ZoomIn, ZoomOut, Sparkles, Bot, User,
  Network, Activity, Phone, Mail, Settings,
}
