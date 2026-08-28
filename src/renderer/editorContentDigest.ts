/**
 * #273: SHA-256 digest of the *normalized editor content*, for the
 * (later) Session layer to decide whether a saved editor View State may be
 * re-applied to the document that is open now.
 *
 * This module is deliberately CodeMirror-agnostic and side-effect free — it
 * only knows about plain strings. It never reads a file, never touches
 * Electron / userData / SQLite / `pergamum.json`, and never persists
 * anything. #273 explicitly excludes Session persistence; this is only the
 * `capture → validate → apply` foundation those later Issues will build on.
 *
 * The digest is computed over `normalizeEditorContentForDigest(content)`,
 * NOT over the raw file bytes: two documents that read as the *same text in
 * the Pergamum editor* must produce the same digest even if their on-disk
 * form differs by a UTF-8 BOM or by CRLF / CR / LF line endings. Pergamum
 * already normalizes line endings to "\n" when a document is opened (see
 * currentDocument.ts / lineEndingTracking.ts) and strips a leading BOM on
 * read (see markdownFileIo.ts); the extra normalization here is a
 * defensive belt-and-braces so the digest contract holds regardless of how
 * the caller obtained the string.
 *
 * The hash is a small, dependency-free, synchronous SHA-256 implementation
 * (FIPS 180-4). It is only ever meant to run at *capture* time and at
 * *apply* time — never on the editor input critical path, never per
 * keystroke.
 */

export type EditorContentDigestAlgorithm = "sha256";

export interface EditorContentDigest {
  readonly algorithm: EditorContentDigestAlgorithm;
  /** Lowercase hex, 64 characters. */
  readonly digest: string;
}

const BYTE_ORDER_MARK = 0xfeff;

/**
 * Collapses the incidental representation differences that must NOT change
 * a document's identity for View State purposes:
 *
 * - a single leading UTF-8 BOM (U+FEFF) is dropped;
 * - every CRLF / CR is folded to LF.
 *
 * Idempotent: Pergamum's editor content is already in this form, so calling
 * this on live editor content is a no-op walk.
 */
export function normalizeEditorContentForDigest(content: string): string {
  const withoutBom =
    content.charCodeAt(0) === BYTE_ORDER_MARK ? content.slice(1) : content;

  return withoutBom.replace(/\r\n?/g, "\n");
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * Synchronous SHA-256 of a string's UTF-8 encoding, returned as lowercase
 * hex. Kept synchronous on purpose: the callers (capture / apply) are
 * one-shot and benefit from a plain return value rather than a Promise, and
 * this never runs on the editor input path.
 */
export function sha256Hex(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;

  // Padded length: message + 0x80 + zero fill + 8-byte length, to a 64-byte
  // multiple.
  const withMarkLength = message.length + 1;
  const paddedLength =
    withMarkLength + ((56 - (withMarkLength % 64) + 64) % 64) + 8;

  const buffer = new Uint8Array(paddedLength);
  buffer.set(message);
  buffer[message.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const bigSigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + bigSigma1 + ch + SHA256_K[i] + w[i]) | 0;
      const bigSigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (bigSigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return (
    toHex8(h0) +
    toHex8(h1) +
    toHex8(h2) +
    toHex8(h3) +
    toHex8(h4) +
    toHex8(h5) +
    toHex8(h6) +
    toHex8(h7)
  );
}

/**
 * The plain, JSON-serializable digest descriptor stored in an
 * `EditorViewState`. `content` is expected to already be Pergamum's
 * normalized editor content (CodeMirror `doc.toString()` or
 * `CurrentDocument.content`); `normalizeEditorContentForDigest` is applied
 * again here so the result is stable even if it is not.
 */
export function computeEditorContentDigest(content: string): EditorContentDigest {
  return {
    algorithm: "sha256",
    digest: sha256Hex(normalizeEditorContentForDigest(content))
  };
}

/**
 * True when `content` (after normalization) hashes to `digest`. The
 * comparison is algorithm-aware: an unknown algorithm never matches.
 */
export function editorContentMatchesDigest(
  content: string,
  digest: EditorContentDigest
): boolean {
  if (digest.algorithm !== "sha256") {
    return false;
  }

  return computeEditorContentDigest(content).digest === digest.digest;
}
