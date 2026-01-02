/**
 * Core checkpoint functions - shared between hook and tests
 *
 * This module contains all git operations for creating and restoring checkpoints.
 * It has no dependencies on the pi-coding-agent hook system.
 */

import { exec, spawn } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ============================================================================
// Constants & Types
// ============================================================================

export const ZEROS = "0".repeat(40);
export const REF_BASE = "refs/pi-checkpoints";

export interface CheckpointData {
  id: string;
  turnIndex: number;
  sessionId: string;
  headSha: string;
  indexTreeSha: string;
  worktreeTreeSha: string;
  timestamp: number;
}

// ============================================================================
// Git helpers
// ============================================================================

export function git(
  cmd: string,
  cwd: string,
  opts: { env?: NodeJS.ProcessEnv; input?: string } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = exec(
      `git ${cmd}`,
      { cwd, env: opts.env, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
    );
    if (opts.input && proc.stdin) {
      proc.stdin.write(opts.input);
      proc.stdin.end();
    }
  });
}

/** Low-priority git command using spawn (doesn't block shell) */
export function gitLowPriority(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    let current = "";
    let inQuote = false;
    for (const char of cmd) {
      if (char === "'" || char === '"') {
        inQuote = !inQuote;
      } else if (char === " " && !inQuote) {
        if (current) args.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    if (current) args.push(current);

    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `git ${cmd} failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

export const isGitRepo = (cwd: string) =>
  git("rev-parse --is-inside-work-tree", cwd)
    .then(() => true)
    .catch(() => false);

export const getRepoRoot = (cwd: string) =>
  git("rev-parse --show-toplevel", cwd);

// ============================================================================
// Checkpoint operations
// ============================================================================

export async function createCheckpoint(
  root: string,
  id: string,
  turnIndex: number,
  sessionId: string
): Promise<CheckpointData> {
  const timestamp = Date.now();
  const isoTimestamp = new Date(timestamp).toISOString();

  const headSha = await git("rev-parse HEAD", root).catch(() => ZEROS);
  const indexTreeSha = await git("write-tree", root);

  const tmpDir = await mkdtemp(join(tmpdir(), "pi-checkpoint-"));
  const tmpIndex = join(tmpDir, "index");

  try {
    const tmpEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    await git("add -A .", root, { env: tmpEnv });
    const worktreeTreeSha = await git("write-tree", root, { env: tmpEnv });

    const message = [
      `checkpoint:${id}`,
      `sessionId ${sessionId}`,
      `turn ${turnIndex}`,
      `head ${headSha}`,
      `index-tree ${indexTreeSha}`,
      `worktree-tree ${worktreeTreeSha}`,
      `created ${isoTimestamp}`,
    ].join("\n");

    const commitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "pi-checkpoint",
      GIT_AUTHOR_EMAIL: "checkpoint@pi",
      GIT_AUTHOR_DATE: isoTimestamp,
      GIT_COMMITTER_NAME: "pi-checkpoint",
      GIT_COMMITTER_EMAIL: "checkpoint@pi",
      GIT_COMMITTER_DATE: isoTimestamp,
    };

    const commitSha = await git(`commit-tree ${worktreeTreeSha}`, root, {
      input: message,
      env: commitEnv,
    });

    await git(`update-ref ${REF_BASE}/${id} ${commitSha}`, root);

    return {
      id,
      turnIndex,
      sessionId,
      headSha,
      indexTreeSha,
      worktreeTreeSha,
      timestamp,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function restoreCheckpoint(
  root: string,
  cp: CheckpointData
): Promise<void> {
  // 1. Restore HEAD state
  if (cp.headSha !== ZEROS) {
    await git(`reset --hard ${cp.headSha}`, root);
  }

  // 2. Update index AND working tree to match saved worktree snapshot
  await git(`read-tree --reset -u ${cp.worktreeTreeSha}`, root);

  // 3. Remove any extra untracked files not present in the snapshot
  await git("clean -fd", root);

  // 4. Restore the index (staged state) without touching files
  await git(`read-tree --reset ${cp.indexTreeSha}`, root);
}

export async function loadCheckpointFromRef(
  root: string,
  refName: string,
  lowPriority = false
): Promise<CheckpointData | null> {
  try {
    const gitFn = lowPriority ? gitLowPriority : git;
    const commitSha = await gitFn(
      `rev-parse --verify ${REF_BASE}/${refName}`,
      root
    );
    const commitMsg = await gitFn(`cat-file commit ${commitSha}`, root);

    const get = (key: string) =>
      commitMsg.match(new RegExp(`^${key} (.+)$`, "m"))?.[1]?.trim();

    const sessionId = get("sessionId");
    const turn = get("turn");
    const head = get("head");
    const index = get("index-tree");
    const worktree = get("worktree-tree");
    const created = get("created");

    if (!sessionId || !turn || !head || !index || !worktree) return null;

    return {
      id: refName,
      turnIndex: parseInt(turn, 10),
      sessionId,
      headSha: head,
      indexTreeSha: index,
      worktreeTreeSha: worktree,
      timestamp: created ? new Date(created).getTime() : 0,
    };
  } catch {
    return null;
  }
}

export async function listCheckpointRefs(
  root: string,
  lowPriority = false
): Promise<string[]> {
  try {
    const prefix = `${REF_BASE}/`;
    const gitFn = lowPriority ? gitLowPriority : git;
    const stdout = await gitFn(
      `for-each-ref --format="%(refname)" ${prefix}`,
      root
    );
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((ref) => ref.replace(prefix, ""));
  } catch {
    return [];
  }
}

export async function loadAllCheckpoints(
  root: string,
  sessionFilter?: string,
  lowPriority = false
): Promise<CheckpointData[]> {
  const refs = await listCheckpointRefs(root, lowPriority);

  if (lowPriority) {
    const results: CheckpointData[] = [];
    const BATCH_SIZE = 3;
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = refs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((ref) => loadCheckpointFromRef(root, ref, true))
      );
      results.push(
        ...batchResults.filter(
          (cp): cp is CheckpointData =>
            cp !== null && (!sessionFilter || cp.sessionId === sessionFilter)
        )
      );
      await new Promise((resolve) => setImmediate(resolve));
    }
    return results;
  }

  const results = await Promise.all(
    refs.map((ref) => loadCheckpointFromRef(root, ref))
  );
  return results.filter(
    (cp): cp is CheckpointData =>
      cp !== null && (!sessionFilter || cp.sessionId === sessionFilter)
  );
}

// ============================================================================
// Utility functions
// ============================================================================

/** Validate ID contains only safe characters (alphanumeric, dash, underscore) */
export const isSafeId = (id: string) => /^[\w-]+$/.test(id);

/** Find the closest checkpoint to a target timestamp */
export function findClosestCheckpoint(
  checkpoints: CheckpointData[],
  targetTs: number
): CheckpointData {
  return checkpoints.reduce((best, cp) => {
    const bestDiff = Math.abs(best.timestamp - targetTs);
    const cpDiff = Math.abs(cp.timestamp - targetTs);
    // Prefer checkpoint that's before or equal to target
    if (cp.timestamp <= targetTs && best.timestamp > targetTs) return cp;
    if (best.timestamp <= targetTs && cp.timestamp > targetTs) return best;
    return cpDiff < bestDiff ? cp : best;
  });
}
