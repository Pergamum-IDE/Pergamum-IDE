/**
 * Phase 6-4-4: the body-free Recovery report.
 *
 * A user copies this to paste into a GitHub issue / support thread / AI
 * review while dogfooding Recovery. It MUST NOT contain:
 *   - `payload_text` or any manuscript fragment,
 *   - preview snippets,
 *   - raw debug-log event payloads,
 *   - Session snapshot contents,
 *   - project DB contents,
 *   - raw absolute paths (only `hasFilePath` / `hasProjectFilePath`
 *     booleans and the already-basename `displayName`).
 *
 * It also states plainly that it does not identify the cause of the
 * previous shutdown or failure.
 */

import type { RecoveryCandidate } from "../shared/recoveryCandidate";
import type { RecoveryStoreStatus } from "../shared/recovery";

export interface BuildRecoveryReportInput {
  readonly statusKind: RecoveryStoreStatus["kind"] | "unknown";
  readonly appVersion: string | null;
  readonly generatedAt: string;
  readonly candidates: readonly RecoveryCandidate[];
}

const DISCLAIMER_EN =
  "This report describes Recovery candidates found by Pergamum. " +
  "It does not identify the cause of the previous shutdown or failure.";
const DISCLAIMER_JA =
  "このレポートは Pergamum が検出した復旧候補の情報です。" +
  "前回終了または障害の原因を特定するものではありません。";

function candidateBlock(candidate: RecoveryCandidate): string {
  return [
    `- id: ${candidate.recoveryId}`,
    `  type: ${candidate.documentType}`,
    `  name: ${candidate.displayName}`,
    `  updatedAt: ${candidate.updatedAt}`,
    `  characterCount: ${candidate.characterCount}`,
    `  encoding: ${candidate.documentEncoding ?? "-"}`,
    `  lineend: ${candidate.documentLineend ?? "-"}`,
    `  hasFilePath: ${candidate.hasFilePath}`,
    `  hasProjectFilePath: ${candidate.hasProjectFilePath}`
  ].join("\n");
}

export function buildRecoveryReport(input: BuildRecoveryReportInput): string {
  const header = [
    "Pergamum Recovery Report",
    DISCLAIMER_EN,
    DISCLAIMER_JA,
    "",
    `generatedAt: ${input.generatedAt}`,
    `appVersion: ${input.appVersion ?? "unknown"}`,
    `recoveryStore: ${input.statusKind}`,
    `candidates: ${input.candidates.length}`
  ];

  if (input.candidates.length === 0) {
    return `${header.join("\n")}\n`;
  }

  return `${header.join("\n")}\n\n${input.candidates
    .map(candidateBlock)
    .join("\n")}\n`;
}
