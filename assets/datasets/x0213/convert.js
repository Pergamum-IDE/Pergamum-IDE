import fs from 'fs';

const lines = fs.readFileSync('jisx0213-2004-8bit-std.txt', 'utf-8').split('\n');
const map = {};

for (const line of lines) {
  // コメント行や空行はスキップ
  if (!line || line.startsWith('#')) continue;

  const parts = line.split('\t');
  if (parts.length < 2) continue;

  const jisHex = parseInt(parts[0], 16);
  const uHexStr = parts[1].trim();

  // Unicodeの指定がない、または予約領域はスキップ
  if (!uHexStr.startsWith('U+')) continue;

  // 上位・下位バイトの抽出
  const high = (jisHex >> 8) & 0xFF;
  const low = jisHex & 0xFF;

  let men, ku, ten;

  if (high >= 0x21 && high <= 0x7E) {
    men = 1;
    ku = high - 0x20;
    ten = low - 0x20;
  } else if (high >= 0xA1 && high <= 0xFE) {
    men = 2;
    ku = high - 0xA0;
    ten = low - 0xA0;
  } else {
    continue;
  }

  // U+xxxx または U+xxxx+xxxx (結合文字) を文字に変換
  const unicodeChar = uHexStr
    .split('+')
    .slice(1) // 'U' を除外
    .map(hex => String.fromCodePoint(parseInt(hex, 16)))
    .join('');

  // キーは青空文庫形式（例: "1-16-1", "2-12-48"）
  map[`${men}-${ku}-${ten}`] = unicodeChar;
}

// JSONとして保存
fs.writeFileSync('aozora-gaiji-map.json', JSON.stringify(map, null, 2));
console.log(`辞書作成完了: ${Object.keys(map).length} 文字登録`);
