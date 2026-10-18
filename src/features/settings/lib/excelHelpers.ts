/**
 * Thin ExcelJS helpers shared by import/export.
 * CSV is handled with a small parser (no Node streams) so the same code
 * runs in the browser and in Vitest.
 */

import ExcelJS from 'exceljs'

export type SheetRow = Record<string, unknown>

/** Read an .xlsx buffer into named sheets of header→value row objects. */
export async function readWorkbookSheets(
  data: ArrayBuffer | Uint8Array,
): Promise<Array<{ name: string; rows: SheetRow[] }>> {
  const workbook = new ExcelJS.Workbook()
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  // exceljs typings expect Buffer; Uint8Array works at runtime in browser + Vitest
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const out: Array<{ name: string; rows: SheetRow[] }> = []
  workbook.eachSheet((sheet) => {
    out.push({ name: sheet.name, rows: worksheetToRows(sheet) })
  })
  return out
}

/** Parse CSV text into a single logical sheet. */
export function readCsvText(text: string): Array<{ name: string; rows: SheetRow[] }> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]!)
  const rows: SheetRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!)
    const obj: SheetRow = {}
    let any = false
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c + 1}`
      const val = cols[c] ?? ''
      obj[key] = val === '' ? null : val
      if (val !== '') any = true
    }
    if (any) rows.push(obj)
  }
  return [{ name: 'Sheet1', rows }]
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

function worksheetToRows(sheet: ExcelJS.Worksheet): SheetRow[] {
  const rows: SheetRow[] = []
  let headers: string[] = []
  sheet.eachRow((row, rowNumber) => {
    const values = row.values as Array<ExcelJS.CellValue | undefined>
    if (rowNumber === 1) {
      headers = values.slice(1).map((v, i) => String(cellToPrimitive(v) ?? `col_${i + 1}`))
      return
    }
    const obj: SheetRow = {}
    let any = false
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!
      const val = cellToPrimitive(values[i + 1])
      obj[header] = val
      if (val != null && val !== '') any = true
    }
    if (any) rows.push(obj)
  })
  return rows
}

function cellToPrimitive(value: ExcelJS.CellValue | undefined): unknown {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('')
    }
    if ('result' in value) return cellToPrimitive(value.result as ExcelJS.CellValue)
    if ('text' in value && typeof (value as { text: string }).text === 'string') {
      return (value as { text: string }).text
    }
  }
  return value
}

/** Build a workbook from named sheets of row objects and return an ArrayBuffer. */
export async function writeWorkbookBuffer(
  sheets: Array<{ name: string; rows: SheetRow[] }>,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  for (const { name, rows } of sheets) {
    if (rows.length === 0) continue
    const ws = workbook.addWorksheet(name)
    // Union keys across all rows so sparse columns (e.g. Weight vs Best Set) survive
    const headerSet = new Set<string>()
    for (const row of rows) {
      for (const k of Object.keys(row)) headerSet.add(k)
    }
    const headers = Array.from(headerSet)
    ws.addRow(headers)
    for (const row of rows) {
      ws.addRow(headers.map((h) => (row[h] == null ? null : row[h])))
    }
  }
  const buf = await workbook.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  const u8 = new Uint8Array(buf as ArrayBufferLike)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/** Escape and join CSV fields. */
export function rowsToCsv(rows: SheetRow[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const escape = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}
