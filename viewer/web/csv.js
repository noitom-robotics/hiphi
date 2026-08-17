/**
 * Minimal RFC-4180 CSV parser: quoted fields, embedded commas/quotes/newlines.
 * Returns rows of raw string cells; callers map them onto typed records.
 * The HiPHI index quotes `text_annotation`, which routinely contains commas,
 * so naive line-splitting is not an option.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  let i = 0

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    // Skip rows that are entirely empty (trailing newline artifacts).
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }
    if (c === '"' && cell === '') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      endCell()
      i++
      continue
    }
    if (c === '\n') {
      endRow()
      i++
      continue
    }
    if (c === '\r') {
      // Normalize CRLF and lone CR to a row break.
      if (text[i + 1] === '\n') i++
      endRow()
      i++
      continue
    }
    cell += c
    i++
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
