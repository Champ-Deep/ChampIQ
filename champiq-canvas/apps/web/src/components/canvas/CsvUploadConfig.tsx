/**
 * Inspector for the `csv.upload` node.
 *
 * Self-contained: parses the CSV in the browser and writes the rows directly
 * into `config.items`. No server upload, no file_id, no DB. The node carries
 * its data with it.
 */
import { useRef } from 'react'
import { useCanvasStore } from '@/store/canvasStore'

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

interface ParsedCsv {
  rows: Record<string, string>[]
  header: string[]
}

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes,
// embedded newlines/commas. Good enough for prospect CSVs; not a general-
// purpose CSV library.
function parseCsv(text: string): ParsedCsv {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let i = 0
  let inQuotes = false
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue }
    field += ch; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  if (rows.length === 0) return { rows: [], header: [] }
  const header = rows[0].map((h) => h.trim())
  const data: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    if (cells.length === 1 && cells[0] === '') continue  // blank line
    const obj: Record<string, string> = {}
    for (let c = 0; c < header.length; c++) obj[header[c]] = (cells[c] ?? '').trim()
    data.push(obj)
  }
  return { rows: data, header }
}

export function CsvUploadConfig({ nodeId, config }: Props) {
  const { updateNodeConfig } = useCanvasStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const items = (config.items as Record<string, string>[] | undefined) ?? []
  const filename = (config.filename as string | undefined) ?? ''
  const rowCount = items.length
  const headerCols = items.length > 0 ? Object.keys(items[0]) : []

  async function handleFile(file: File) {
    const text = await file.text()
    const parsed = parseCsv(text)
    updateNodeConfig(nodeId, {
      ...config,
      items: parsed.rows,
      filename: file.name,
      row_count: parsed.rows.length,
    })
  }

  function handleClear() {
    updateNodeConfig(nodeId, {
      ...config,
      items: [],
      filename: '',
      row_count: 0,
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-xs" style={{ color: 'var(--text-2)' }}>
        Uploads a CSV. Rows are stored in the node config — no server upload,
        portable across export/import. Output: <code>{`{ items, count, filename }`}</code>.
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          CSV file
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
          className="text-xs"
          style={{ color: 'var(--text-2)' }}
        />
      </div>

      {rowCount > 0 ? (
        <div
          className="rounded p-2 text-xs flex flex-col gap-1"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
        >
          <div style={{ color: 'var(--text-1)' }}>
            <span className="font-medium">{filename || '(unnamed)'}</span>
            {' · '}
            <span>{rowCount} row{rowCount === 1 ? '' : 's'}</span>
          </div>
          <div style={{ color: 'var(--text-3)' }}>
            Columns: {headerCols.join(', ') || '(none)'}
          </div>
          <button
            onClick={handleClear}
            className="self-start mt-1 text-xs px-2 py-1 rounded"
            style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          No CSV uploaded yet.
        </div>
      )}
    </div>
  )
}
