import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Raw mapping data based on "アクセント付き文字の変換表 0.11"
 * (https://cosmoshouse.com/tools/acc-conv-j.htm)
 */
const rawMappings = [
  // Punctuation & Symbols
  { source: "!@", replacement: "¡" },
  { source: "?@", replacement: "¿" },

  // Grave (`)
  { source: "A`", replacement: "À" },
  { source: "a`", replacement: "à" },
  { source: "E`", replacement: "È" },
  { source: "e`", replacement: "è" },
  { source: "I`", replacement: "Ì" },
  { source: "i`", replacement: "ì" },
  { source: "O`", replacement: "Ò" },
  { source: "o`", replacement: "ò" },
  { source: "U`", replacement: "Ù" },
  { source: "u`", replacement: "ù" },

  // Acute (')
  { source: "A'", replacement: "Á" },
  { source: "a'", replacement: "á" },
  { source: "E'", replacement: "É" },
  { source: "e'", replacement: "é" },
  { source: "I'", replacement: "Í" },
  { source: "i'", replacement: "í" },
  { source: "O'", replacement: "Ó" },
  { source: "o'", replacement: "ó" },
  { source: "U'", replacement: "Ú" },
  { source: "u'", replacement: "ú" },
  { source: "Y'", replacement: "Ý" },
  { source: "y'", replacement: "ý" },

  // Circumflex (^)
  { source: "A^", replacement: "Â" },
  { source: "a^", replacement: "â" },
  { source: "E^", replacement: "Ê" },
  { source: "e^", replacement: "ê" },
  { source: "I^", replacement: "Î" },
  { source: "i^", replacement: "î" },
  { source: "O^", replacement: "Ô" },
  { source: "o^", replacement: "ô" },
  { source: "U^", replacement: "Û" },
  { source: "u^", replacement: "û" },

  // Tilde (~)
  { source: "A~", replacement: "Ã" },
  { source: "a~", replacement: "ã" },
  { source: "N~", replacement: "Ñ" },
  { source: "n~", replacement: "ñ" },
  { source: "O~", replacement: "Õ" },
  { source: "o~", replacement: "õ" },

  // Umlaut / Dieresis (:)
  { source: "A:", replacement: "Ä" },
  { source: "a:", replacement: "ä" },
  { source: "E:", replacement: "Ë" },
  { source: "e:", replacement: "ë" },
  { source: "I:", replacement: "Ï" },
  { source: "i:", replacement: "ï" },
  { source: "O:", replacement: "Ö" },
  { source: "o:", replacement: "ö" },
  { source: "U:", replacement: "Ü" },
  { source: "u:", replacement: "ü" },
  { source: "Y:", replacement: "Ÿ" },
  { source: "y:", replacement: "ÿ" },

  // Ring (*)
  { source: "A*", replacement: "Å" },
  { source: "a*", replacement: "å" },

  // Cedilla (,)
  { source: "C,", replacement: "Ç" },
  { source: "c,", replacement: "ç" },

  // Slash / Stroke (/)
  { source: "O/", replacement: "Ø" },
  { source: "o/", replacement: "ø" },

  // Macron (_)
  { source: "A_", replacement: "Ā" },
  { source: "a_", replacement: "ā" },
  { source: "E_", replacement: "Ē" },
  { source: "e_", replacement: "ē" },
  { source: "I_", replacement: "Ī" },
  { source: "i_", replacement: "ī" },
  { source: "O_", replacement: "Ō" },
  { source: "o_", replacement: "ō" },
  { source: "U_", replacement: "Ū" },
  { source: "u_", replacement: "ū" },

  // Ligatures & Special (&, TH, D-)
  { source: "AE&", replacement: "Æ" },
  { source: "ae&", replacement: "æ" },
  { source: "OE&", replacement: "Œ" },
  { source: "oe&", replacement: "œ" },
  { source: "s&", replacement: "ß" },
  { source: "TH", replacement: "Þ" },
  { source: "th", replacement: "þ" },
  { source: "D-", replacement: "Ð" },
  { source: "d-", replacement: "ð" }
];

function generateTable() {
  // Validate and filter out invalid/empty/N/A entries if any exist
  const validEntries = rawMappings.filter(
    (entry) =>
      entry.source &&
      entry.replacement &&
      entry.replacement !== "--" &&
      entry.replacement !== "N/A"
  );

  // Check for duplicates
  const seenSources = new Set();
  for (const entry of validEntries) {
    if (seenSources.has(entry.source)) {
      throw new Error(`Duplicate source key in table generation: ${entry.source}`);
    }
    seenSources.add(entry.source);
  }

  // Sort by source.length descending, then source ascending deterministically
  validEntries.sort((a, b) => {
    if (b.source.length !== a.source.length) {
      return b.source.length - a.source.length;
    }
    return a.source.localeCompare(b.source);
  });

  const outputPath = path.resolve(
    __dirname,
    "../src/shared/aozoraAccentDecompositionTable.json"
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(validEntries, null, 2) + "\n",
    "utf-8"
  );

  console.log(`Generated ${validEntries.length} entries to ${outputPath}`);
}

generateTable();
