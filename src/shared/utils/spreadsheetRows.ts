import * as XLSX from 'xlsx'

export function sheetToRows<T>(sheet: XLSX.WorkSheet): T[][] {
  let lastRow = -1
  let lastColumn = -1
  Object.keys(sheet).forEach((address) => {
    if (address.startsWith('!')) return
    const cell = sheet[address] as XLSX.CellObject | undefined
    if (!cell || (cell.v === undefined && !cell.f)) return
    const decoded = XLSX.utils.decode_cell(address)
    lastRow = Math.max(lastRow, decoded.r)
    lastColumn = Math.max(lastColumn, decoded.c)
  })
  if (lastRow < 0 || lastColumn < 0) return []
  return XLSX.utils.sheet_to_json<T[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    range: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } }),
  })
}
