// champiq-canvas/apps/web/src/lib/api/index.ts
export * from './types'
export * from './champmail'
export * from './canvas'
export * from './workflows'
export * from './credentials'
export * from './chat'
export * from './tools'

// Backwards-compat: re-export as the legacy `api` object so existing
// callers using `api.cmListProspects(...)` etc. continue to compile.
import * as _cm  from './champmail'
import * as _cv  from './canvas'
import * as _wf  from './workflows'
import * as _cr  from './credentials'
import * as _ch  from './chat'
import * as _tl  from './tools'

export const api = { ..._cm, ..._cv, ..._wf, ..._cr, ..._ch, ..._tl }
