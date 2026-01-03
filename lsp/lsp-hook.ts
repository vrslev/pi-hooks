/**
 * LSP Hook utilities - state management and event handlers
 */
import * as path from "node:path";
import * as fs from "node:fs";
import type { LSPManager } from "./lsp-core.js";
import { LSP_SERVERS, formatDiagnostic, getOrCreateManager, shutdownManager } from "./lsp-core.js";

const DIAGNOSTICS_WAIT_MS = 3000;
const DIM = "\x1b[2m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

export interface LSPState {
  manager: LSPManager | null;
  activeClients: Set<string>;
  statusUpdateFn: ((key: string, text: string | undefined) => void) | null;
}

export function createInitialState(): LSPState {
  return { manager: null, activeClients: new Set(), statusUpdateFn: null };
}

function updateLspStatus(state: LSPState): void {
  if (!state.statusUpdateFn) return;
  if (state.activeClients.size === 0) {
    state.statusUpdateFn("lsp", undefined);
  } else {
    state.statusUpdateFn("lsp", `${GREEN}LSP${RESET} ${DIM}${[...state.activeClients].join(", ")}${RESET}`);
  }
}

export function handleSessionStart(state: LSPState, ctx: any): void {
  state.manager = getOrCreateManager(ctx.cwd);
  state.statusUpdateFn = ctx.hasUI && ctx.ui.setStatus ? ctx.ui.setStatus.bind(ctx.ui) : null;

  const warmupMap: Record<string, string> = {
    "pubspec.yaml": ".dart", "package.json": ".ts", "pyproject.toml": ".py", "go.mod": ".go", "Cargo.toml": ".rs",
  };

  for (const [marker, ext] of Object.entries(warmupMap)) {
    if (fs.existsSync(path.join(ctx.cwd, marker))) {
      state.statusUpdateFn?.("lsp", `${YELLOW}LSP${RESET} ${DIM}Loading...${RESET}`);
      state.manager.getClientsForFile(path.join(ctx.cwd, `dummy${ext}`))
        .then((clients) => {
          if (clients.length > 0) {
            const cfg = LSP_SERVERS.find((s) => s.extensions.includes(ext));
            if (cfg) { state.activeClients.add(cfg.id); updateLspStatus(state); }
          } else updateLspStatus(state);
        })
        .catch(() => updateLspStatus(state));
      break;
    }
  }
}

export async function handleSessionShutdown(state: LSPState): Promise<void> {
  await shutdownManager();
  state.manager = null;
  state.activeClients.clear();
  state.statusUpdateFn?.("lsp", undefined);
}

export async function handleToolResult(
  state: LSPState, toolName: string, input: Record<string, unknown>,
  content: Array<{ type: string; text?: string }>, ctx: any
): Promise<{ content: Array<{ type: "text"; text: string }> } | undefined> {
  if (!state.manager || (toolName !== "write" && toolName !== "edit")) return;

  const filePath = input.path as string;
  if (!filePath) return;

  const ext = path.extname(filePath);
  const cfg = LSP_SERVERS.find((s) => s.extensions.includes(ext));
  if (!cfg) return;

  if (!state.activeClients.has(cfg.id)) {
    state.activeClients.add(cfg.id);
    updateLspStatus(state);
  }

  try {
    const result = await state.manager.touchFileAndWait(filePath, DIAGNOSTICS_WAIT_MS);
    if (!result.receivedResponse) return;

    const errors = toolName === "edit" 
      ? result.diagnostics.filter((d) => d.severity === 1) 
      : result.diagnostics;
    if (!errors.length) return;

    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.cwd, filePath);
    const relativePath = path.relative(ctx.cwd, absPath);
    const errorCount = errors.filter((e) => e.severity === 1).length;

    const MAX = 5;
    const lines = errors.slice(0, MAX).map((e) => {
      const sev = e.severity === 1 ? "ERROR" : "WARN";
      return `${sev}[${e.range.start.line + 1}] ${e.message.split("\n")[0]}`;
    });

    let notification = `📋 ${relativePath}\n${lines.join("\n")}`;
    if (errors.length > MAX) notification += `\n... +${errors.length - MAX} more`;

    if (ctx.hasUI) ctx.ui.notify(notification, errorCount > 0 ? "error" : "warning");
    else console.error(notification);

    const output = `\nThis file has errors, please fix\n<file_diagnostics>\n${errors.map(formatDiagnostic).join("\n")}\n</file_diagnostics>\n`;
    return { content: [...content, { type: "text" as const, text: output }] as Array<{ type: "text"; text: string }> };
  } catch {}
}
