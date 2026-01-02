/**
 * Pi-specific checkpoint utilities
 *
 * This module contains hook-specific logic that bridges checkpoint-core
 * with the pi-coding-agent hook system.
 */

import { exec } from "child_process";
import { readFile } from "fs/promises";
import {
  isGitRepo,
  getRepoRoot,
  createCheckpoint,
  restoreCheckpoint,
  loadAllCheckpoints,
  findClosestCheckpoint,
  isSafeId,
  type CheckpointData,
} from "./checkpoint-core.js";

// ============================================================================
// State management
// ============================================================================

export interface CheckpointState {
  gitAvailable: boolean;
  checkpointingFailed: boolean;
  currentSessionId: string;
  currentSessionFile: string | undefined;
  checkpointCache: CheckpointData[] | null;
  cacheSessionIds: Set<string>;
  pendingCheckpoint: Promise<void> | null;
}

export function createInitialState(): CheckpointState {
  return {
    gitAvailable: false,
    checkpointingFailed: false,
    currentSessionId: "",
    currentSessionFile: undefined,
    checkpointCache: null,
    cacheSessionIds: new Set(),
    pendingCheckpoint: null,
  };
}

/** Add checkpoint to cache */
function addToCache(state: CheckpointState, cp: CheckpointData): void {
  if (state.checkpointCache) {
    state.checkpointCache.push(cp);
    state.cacheSessionIds.add(cp.sessionId);
  }
}

/** Replace entire cache */
function setCache(state: CheckpointState, cps: CheckpointData[]): void {
  state.checkpointCache = cps;
  state.cacheSessionIds = new Set(cps.map((cp) => cp.sessionId));
}

// Repo root cache (module-level for efficiency across sessions)
let cachedRepoRoot: string | null = null;
let cachedRepoCwd: string | null = null;

export async function getCachedRepoRoot(cwd: string): Promise<string> {
  if (cachedRepoCwd !== cwd) {
    cachedRepoRoot = null;
    cachedRepoCwd = cwd;
  }
  if (!cachedRepoRoot) {
    cachedRepoRoot = await getRepoRoot(cwd);
  }
  return cachedRepoRoot;
}

export function resetRepoCache(): void {
  cachedRepoRoot = null;
  cachedRepoCwd = null;
}

// ============================================================================
// Session helpers
// ============================================================================

/** Extract session ID from a session file */
export async function getSessionIdFromFile(
  sessionFile: string
): Promise<string> {
  try {
    const content = await readFile(sessionFile, "utf-8");
    if (content.trim()) {
      const id = JSON.parse(content.split("\n")[0]).id || "";
      if (isSafeId(id)) return id;
    }
  } catch {}

  const basename = sessionFile.split("/").pop() || "";
  const match = basename.match(/_([0-9a-f-]{36})\.jsonl$/);
  if (match && isSafeId(match[1])) {
    return match[1];
  }

  return "";
}

/** Update session info from context */
export function updateSessionInfo(
  state: CheckpointState,
  sessionManager: any
): void {
  state.currentSessionFile = sessionManager.getSessionFile();
  const header = sessionManager.getHeader();
  state.currentSessionId = header?.id && isSafeId(header.id) ? header.id : "";
}

// ============================================================================
// Checkpoint operations
// ============================================================================

/** Load checkpoints for session chain (current + ancestors) */
export async function loadSessionChainCheckpoints(
  state: CheckpointState,
  cwd: string,
  header: { id?: string; branchedFrom?: string } | undefined
): Promise<CheckpointData[]> {
  if (state.pendingCheckpoint) await state.pendingCheckpoint;

  const sessionIds: string[] = [];

  if (header?.id && isSafeId(header.id)) {
    sessionIds.push(header.id);
  } else if (state.currentSessionId) {
    sessionIds.push(state.currentSessionId);
  }

  // Walk the branchedFrom chain
  let branchedFrom = header?.branchedFrom;
  while (branchedFrom) {
    const match = branchedFrom.match(/_([0-9a-f-]{36})\.jsonl$/);
    if (match && isSafeId(match[1]) && !sessionIds.includes(match[1])) {
      sessionIds.push(match[1]);
    }
    try {
      const { stdout } = await new Promise<{ stdout: string }>(
        (resolve, reject) => {
          exec(
            `head -1 "${branchedFrom}" | grep -o '"branchedFrom":"[^"]*"' | cut -d'"' -f4`,
            (err, stdout) =>
              err ? reject(err) : resolve({ stdout: stdout || "" })
          );
        }
      );
      branchedFrom = stdout.trim() || undefined;
    } catch {
      break;
    }
  }

  if (sessionIds.length === 0) return [];

  const needsRefresh = sessionIds.some((id) => !state.cacheSessionIds.has(id));
  const root = await getCachedRepoRoot(cwd);

  if (state.checkpointCache && !needsRefresh) {
    const sessionSet = new Set(sessionIds);
    return state.checkpointCache.filter((cp) => sessionSet.has(cp.sessionId));
  }

  const allCheckpoints = await loadAllCheckpoints(root);
  setCache(state, allCheckpoints);

  const sessionSet = new Set(sessionIds);
  return allCheckpoints.filter((cp) => sessionSet.has(cp.sessionId));
}

/** Save current state and restore to checkpoint */
export async function saveAndRestore(
  state: CheckpointState,
  cwd: string,
  target: CheckpointData,
  notify: (msg: string, type: "info" | "error" | "warning") => void
): Promise<void> {
  try {
    const root = await getCachedRepoRoot(cwd);
    const beforeId = `${state.currentSessionId}-before-restore-${Date.now()}`;
    const newCp = await createCheckpoint(
      root,
      beforeId,
      0,
      state.currentSessionId
    );
    addToCache(state, newCp);
    await restoreCheckpoint(root, target);
    notify("Files restored to checkpoint", "info");
  } catch (error) {
    notify(
      `Restore failed: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  }
}

/** Create a checkpoint for the current turn */
export async function createTurnCheckpoint(
  state: CheckpointState,
  cwd: string,
  turnIndex: number,
  timestamp: number
): Promise<void> {
  const root = await getCachedRepoRoot(cwd);
  const id = `${state.currentSessionId}-turn-${turnIndex}-${timestamp}`;
  const cp = await createCheckpoint(root, id, turnIndex, state.currentSessionId);
  addToCache(state, cp);
}

/** Preload checkpoints in background */
export async function preloadCheckpoints(
  state: CheckpointState,
  cwd: string
): Promise<void> {
  const root = await getCachedRepoRoot(cwd);
  const cps = await loadAllCheckpoints(root, undefined, true);
  setCache(state, cps);
}

// ============================================================================
// Restore UI
// ============================================================================

type RestoreChoice = "all" | "conv" | "code" | "cancel";

const restoreOptions: { label: string; value: RestoreChoice }[] = [
  { label: "Restore all (files + conversation)", value: "all" },
  { label: "Conversation only (keep current files)", value: "conv" },
  { label: "Code only (restore files, keep conversation)", value: "code" },
  { label: "Cancel", value: "cancel" },
];

/** Handle restore prompt for branch/tree navigation */
export async function handleRestorePrompt(
  state: CheckpointState,
  ctx: any,
  getTargetEntryId: () => string
): Promise<{ cancel: true } | undefined> {
  const checkpointLoadPromise = loadSessionChainCheckpoints(
    state,
    ctx.cwd,
    ctx.sessionManager.getHeader()
  );

  const choice = await ctx.ui.select(
    "Restore code state?",
    restoreOptions.map((o) => o.label)
  );

  const selected =
    restoreOptions.find((o) => o.label === choice)?.value ?? "cancel";

  if (selected === "cancel") {
    return { cancel: true };
  }
  if (selected === "conv") {
    return undefined;
  }

  const checkpoints = await checkpointLoadPromise;

  if (checkpoints.length === 0) {
    ctx.ui.notify("No checkpoints available", "warning");
    return selected === "code" ? { cancel: true } : undefined;
  }

  const targetEntry = ctx.sessionManager.getEntry(getTargetEntryId());
  const targetTs = targetEntry?.timestamp
    ? new Date(targetEntry.timestamp).getTime()
    : Date.now();

  const checkpoint = findClosestCheckpoint(checkpoints, targetTs);

  await saveAndRestore(state, ctx.cwd, checkpoint, ctx.ui.notify.bind(ctx.ui));
  return selected === "code" ? { cancel: true } : undefined;
}

// Re-export what the hook needs from core
export { isGitRepo, isSafeId };
