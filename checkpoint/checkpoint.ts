/**
 * Git-based checkpoint hook for pi-coding-agent
 *
 * Creates checkpoints at the start of each turn so you can restore
 * code state when branching conversations.
 *
 * Features:
 * - Captures tracked, staged, AND untracked files (respects .gitignore)
 * - Persists checkpoints as git refs (survives session resume)
 * - Saves current state before restore (allows going back to latest)
 *
 * Usage:
 *   pi --hook ./checkpoint.ts
 *
 * Or add to ~/.pi/agent/hooks/ or .pi/hooks/ for automatic loading.
 */

import type { HookAPI } from "@mariozechner/pi-coding-agent/hooks";
import {
  createInitialState,
  resetRepoCache,
  isGitRepo,
  isSafeId,
  updateSessionInfo,
  getSessionIdFromFile,
  preloadCheckpoints,
  handleRestorePrompt,
  createTurnCheckpoint,
} from "./checkpoint-hook.js";

export default function (pi: HookAPI) {
  const state = createInitialState();

  pi.on("session_start", async (event, ctx) => {
    resetRepoCache();

    state.gitAvailable = await isGitRepo(ctx.cwd);
    if (!state.gitAvailable) return;

    updateSessionInfo(state, ctx.sessionManager);

    setImmediate(async () => {
      try {
        await preloadCheckpoints(state, ctx.cwd);
      } catch { }
    });
  });

  pi.on("session_switch", async (event, ctx) => {
    if (!state.gitAvailable) return;
    updateSessionInfo(state, ctx.sessionManager);
  });

  pi.on("session_branch", async (event, ctx) => {
    if (!state.gitAvailable) return;
    updateSessionInfo(state, ctx.sessionManager);
  });

  pi.on("session_before_branch", async (event, ctx) => {
    if (!state.gitAvailable) return undefined;
    // "code only" cancels branch - restores files, keeps conversation intact
    return handleRestorePrompt(state, ctx, () => event.entryId);
  });

  pi.on("session_before_tree", async (event, ctx) => {
    if (!state.gitAvailable) return undefined;
    // "code only" cancels navigation - restores files, keeps conversation intact
    return handleRestorePrompt(state, ctx, () => event.preparation.targetId);
  });

  pi.on("turn_start", async (event, ctx) => {
    if (!state.gitAvailable || state.checkpointingFailed) return;

    if (!state.currentSessionId && state.currentSessionFile) {
      state.currentSessionId = await getSessionIdFromFile(
        state.currentSessionFile
      );
    }
    if (!state.currentSessionId) return;

    state.pendingCheckpoint = (async () => {
      try {
        await createTurnCheckpoint(
          state,
          ctx.cwd,
          event.turnIndex,
          event.timestamp
        );
      } catch {
        state.checkpointingFailed = true;
      }
    })();
  });
}
