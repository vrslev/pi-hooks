/**
 * LSP Hook for pi-coding-agent
 *
 * Provides Language Server Protocol integration for diagnostics feedback.
 * After file writes/edits, automatically fetches LSP diagnostics and appends
 * them to the tool result so the agent can fix errors.
 *
 * Supported languages:
 *   - Dart/Flutter (dart language-server)
 *   - TypeScript/JavaScript (typescript-language-server)
 *   - Vue (vue-language-server)
 *   - Svelte (svelteserver)
 *   - Python (pyright-langserver)
 *   - Go (gopls)
 *   - Rust (rust-analyzer)
 *
 * Usage:
 *   pi --hook ./lsp.ts
 *
 * Or add to ~/.pi/agent/hooks/ or .pi/hooks/ for automatic loading.
 */

import type { HookAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent/hooks";
import {
  createInitialState,
  handleSessionStart,
  handleSessionShutdown,
  handleToolResult,
} from "./lsp-hook.js";

export default function (pi: HookAPI) {
  const state = createInitialState();

  pi.on("session_start", async (event, ctx) => {
    handleSessionStart(state, ctx);
  });

  pi.on("session_shutdown", async () => {
    await handleSessionShutdown(state);
  });

  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    return handleToolResult(
      state,
      event.toolName,
      event.input as Record<string, unknown>,
      event.content as Array<{ type: string; text?: string }>,
      ctx
    );
  });
}
