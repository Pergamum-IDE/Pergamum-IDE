/**
 * Generates a GFM Markdown table skeleton string for the specified number of
 * columns and rows (1..6).
 *
 * @param columns Number of columns (1..6)
 * @param rows Number of data rows (1..6)
 * @returns GFM Markdown table string
 */
export function generateMarkdownTable(columns: number, rows: number): string {
  const safeCols = Math.max(1, Math.min(6, Math.floor(columns || 1)));
  const safeRows = Math.max(1, Math.min(6, Math.floor(rows || 1)));

  const headerRow = "|" + "  |".repeat(safeCols);
  const delimiterRow = "|" + " --- |".repeat(safeCols);
  const dataRow = "|" + "  |".repeat(safeCols);

  const dataRows = Array(safeRows).fill(dataRow).join("\n");

  return `${headerRow}\n${delimiterRow}\n${dataRows}`;
}
