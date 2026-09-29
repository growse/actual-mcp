// ----------------------------
// MARKDOWN UTILITIES
// ----------------------------

/**
 * Make free text safe to place inside a markdown table cell.
 *
 * Reason: payee names, category names and especially notes are user-entered and can contain `|`
 * or line breaks, which would otherwise split a cell into extra columns or end the row, breaking
 * any consumer that parses the table by column position.
 *
 * @param value - Cell text
 * @returns Text with `|` escaped and line breaks collapsed to spaces
 */
export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ');
}
