import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { createHash } from "node:crypto";
import { recoveryStoreMetadataKeys } from "../shared/recovery";
import type {
  RecoveryCandidate,
  RecoveryStartupPresentation
} from "../shared/recoveryCandidate";
import { listRecoveryCandidates } from "./recoveryCandidateStore";

const sha256HexPattern = /^[a-f0-9]{64}$/i;

export interface RecoveryCandidateSetSnapshot {
  readonly candidates: readonly RecoveryCandidate[];
  readonly candidateCount: number;
  readonly signature: string | null;
}

export function buildRecoveryCandidateSetSignature(
  candidates: readonly RecoveryCandidate[]
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const signatureInput = [...candidates]
    .map((candidate) => [
      candidate.recoveryId,
      candidate.updatedAt,
      candidate.characterCount
    ] as const)
    .sort(([leftRecoveryId], [rightRecoveryId]) =>
      leftRecoveryId < rightRecoveryId
        ? -1
        : leftRecoveryId > rightRecoveryId
          ? 1
          : 0
    );

  return createHash("sha256")
    .update(JSON.stringify(signatureInput), "utf8")
    .digest("hex");
}

export function readLastSeenRecoverySetSignature(
  database: BetterSqliteDatabase
): string | null {
  const row = database
    .prepare("SELECT value FROM metadata WHERE key = ?")
    .get(recoveryStoreMetadataKeys.lastSeenRecoverySetSignature) as
    | { value?: unknown }
    | undefined;

  return typeof row?.value === "string" &&
    sha256HexPattern.test(row.value)
    ? row.value.toLowerCase()
    : null;
}

export function writeLastSeenRecoverySetSignature(
  database: BetterSqliteDatabase,
  signature: string
): void {
  database
    .prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(recoveryStoreMetadataKeys.lastSeenRecoverySetSignature, signature);
}

export function recoveryCandidateSetSnapshot(
  database: BetterSqliteDatabase,
  currentInstanceRunId: string
): RecoveryCandidateSetSnapshot {
  const candidates = listRecoveryCandidates(database, currentInstanceRunId);
  const signature = buildRecoveryCandidateSetSignature(candidates);

  return {
    candidates,
    candidateCount: candidates.length,
    signature
  };
}

export function markCurrentRecoveryCandidateSetSeen(
  database: BetterSqliteDatabase,
  currentInstanceRunId: string
): RecoveryCandidateSetSnapshot {
  const snapshot = recoveryCandidateSetSnapshot(database, currentInstanceRunId);

  if (snapshot.signature !== null) {
    writeLastSeenRecoverySetSignature(database, snapshot.signature);
  }

  return snapshot;
}

export function evaluateStartupRecoveryPresentation(
  database: BetterSqliteDatabase,
  currentInstanceRunId: string
): RecoveryStartupPresentation {
  const snapshot = recoveryCandidateSetSnapshot(database, currentInstanceRunId);

  if (snapshot.signature === null) {
    return { kind: "none", candidateCount: 0 };
  }

  if (snapshot.signature !== readLastSeenRecoverySetSignature(database)) {
    return {
      kind: "autoShow",
      candidateCount: snapshot.candidateCount,
      signature: snapshot.signature,
      candidates: snapshot.candidates
    };
  }

  return {
    kind: "reminder",
    candidateCount: snapshot.candidateCount,
    signature: snapshot.signature
  };
}
