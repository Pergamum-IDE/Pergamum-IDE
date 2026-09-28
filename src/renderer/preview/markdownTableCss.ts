/**
 * #605: Standalone table CSS for exported HTML / PDF (the app preview's
 * equivalent lives in styles.css under `.preview table`).
 */
export const markdownTableExportCss = [
  `    table {`,
  `      border-collapse: collapse;`,
  `      margin-block: 1em;`,
  `      max-inline-size: 100%;`,
  `    }`,
  `    th, td {`,
  `      border: 1px solid #d0d7de;`,
  `      padding: 6px 10px;`,
  `    }`,
  `    th {`,
  `      font-weight: 600;`,
  `      background-color: #f6f8fa;`,
  `    }`
].join("\n");
