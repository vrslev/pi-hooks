/**
 * Core permission logic - command classification and settings
 *
 * This module contains pure functions for:
 * - Parsing shell commands
 * - Classifying commands by required permission level
 * - Detecting dangerous commands
 * - Managing settings persistence
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "shell-quote";

// ============================================================================
// TYPES
// ============================================================================

export type PermissionLevel = "off" | "low" | "medium" | "high" | "bypassed";

export const LEVELS: PermissionLevel[] = ["off", "low", "medium", "high", "bypassed"];

export const LEVEL_INDEX: Record<PermissionLevel, number> = {
  off: 0,
  low: 1,
  medium: 2,
  high: 3,
  bypassed: 4,
};

export const LEVEL_INFO: Record<PermissionLevel, { label: string; desc: string }> = {
  off: { label: "Off", desc: "Read-only" },
  low: { label: "Low", desc: "File ops only" },
  medium: { label: "Medium", desc: "Dev operations" },
  high: { label: "High", desc: "Full operations" },
  bypassed: { label: "Bypassed", desc: "All checks disabled" },
};

export const LEVEL_ALLOWED_DESC: Record<PermissionLevel, string> = {
  off: "read-only (cat, ls, grep, git status/diff/log, npm list, version checks)",
  low: "read-only + file write/edit",
  medium: "dev ops (install packages, build, test, git commit/pull, file operations)",
  high: "full operations except dangerous commands",
  bypassed: "all operations",
};

export interface Classification {
  level: PermissionLevel;
  dangerous: boolean;
}

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

function getSettingsPath(): string {
  return path.join(process.env.HOME || "", ".pi", "agent", "settings.json");
}

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, unknown>): void {
  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

export function loadGlobalPermission(): PermissionLevel | null {
  const settings = loadSettings();
  const level = (settings.permissionLevel as string)?.toLowerCase();
  if (level && LEVELS.includes(level as PermissionLevel)) {
    return level as PermissionLevel;
  }
  return null;
}

export function saveGlobalPermission(level: PermissionLevel): void {
  const settings = loadSettings();
  settings.permissionLevel = level;
  saveSettings(settings);
}

// ============================================================================
// COMMAND PARSING
// ============================================================================

interface ParsedCommand {
  segments: string[][]; // Commands split by operators
  operators: string[]; // |, &&, ||, ;
  raw: string;
}

function parseCommand(command: string): ParsedCommand {
  const tokens = parse(command);
  const segments: string[][] = [];
  const operators: string[] = [];
  let currentSegment: string[] = [];

  for (const token of tokens) {
    if (typeof token === "string") {
      currentSegment.push(token);
    } else if (token && typeof token === "object" && "op" in token) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      operators.push(token.op as string);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return { segments, operators, raw: command };
}

function getCommandName(tokens: string[]): string {
  if (tokens.length === 0) return "";

  let cmd = tokens[0];

  // Strip path prefix
  if (cmd.includes("/")) {
    cmd = cmd.split("/").pop() || cmd;
  }

  // Strip leading backslash (alias bypass)
  if (cmd.startsWith("\\")) {
    cmd = cmd.slice(1);
  }

  return cmd.toLowerCase();
}

// ============================================================================
// DANGEROUS COMMAND DETECTION
// ============================================================================

function isDangerousCommand(tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const cmd = getCommandName(tokens);
  const args = tokens.slice(1);
  const argsStr = args.join(" ");

  // sudo - always dangerous
  if (cmd === "sudo") return true;

  // rm with recursive + force
  if (cmd === "rm") {
    let hasRecursive = false;
    let hasForce = false;

    for (const arg of args) {
      if (arg === "--recursive") hasRecursive = true;
      if (arg === "--force") hasForce = true;
      if (arg.startsWith("-") && !arg.startsWith("--")) {
        if (arg.includes("r") || arg.includes("R")) hasRecursive = true;
        if (arg.includes("f")) hasForce = true;
      }
    }

    if (hasRecursive && hasForce) return true;
  }

  // chmod 777 or a+rwx
  if (cmd === "chmod") {
    if (argsStr.includes("777") || argsStr.includes("a+rwx")) return true;
  }

  // dd to device
  if (cmd === "dd") {
    if (argsStr.match(/of=\/dev\//)) return true;
  }

  // Dangerous system commands
  if (["mkfs", "fdisk", "parted", "format"].includes(cmd)) return true;

  // Shutdown/reboot
  if (["shutdown", "reboot", "halt", "poweroff", "init"].includes(cmd)) return true;

  // Fork bomb pattern
  if (tokens.join("").includes(":(){ :|:& };:")) return true;

  return false;
}

// ============================================================================
// LEVEL CLASSIFICATION
// ============================================================================

// Common redirection targets (treated as read-only)
const REDIRECTION_TARGETS = new Set([
  "/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr",
  "/dev/zero", "/dev/full", "/dev/random", "/dev/urandom",
  "/dev/fd", "/dev/tty", "/dev/ptmx",
]);

// File descriptor numbers used in redirections (e.g., 2>&1)
const FD_NUMBERS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

// OFF level - read-only commands
const OFF_COMMANDS = new Set([
  // File reading
  "cat", "less", "more", "head", "tail", "bat", "tac",
  // Directory listing/navigation
  "ls", "tree", "pwd", "dir", "vdir", "cd", "pushd", "popd", "dirs",
  // Search
  "grep", "egrep", "fgrep", "rg", "ag", "ack", "find", "fd", "locate", "which", "whereis",
  // Info
  "echo", "printf", "whoami", "id", "date", "cal", "uname", "hostname", "uptime",
  "type", "file", "stat", "wc", "du", "df", "free",
  "ps", "top", "htop", "pgrep",
  "env", "printenv", "set",
  // Man/help
  "man", "help", "info",
  // Pipeline utilities
  "xargs", "tee", "sort", "uniq", "cut", "awk", "sed", "tr", "column", "paste", "join",
  "comm", "diff", "cmp", "patch",
]);

const OFF_GIT_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "remote", "tag",
  "ls-files", "ls-tree", "cat-file", "rev-parse", "describe",
  "shortlog", "blame", "annotate", "whatchanged", "reflog",
]);

const OFF_PACKAGE_SUBCOMMANDS: Record<string, Set<string>> = {
  npm: new Set(["list", "ls", "info", "view", "outdated", "audit", "explain", "why", "search"]),
  yarn: new Set(["list", "info", "why", "outdated", "audit"]),
  pnpm: new Set(["list", "ls", "outdated", "audit", "why"]),
  bun: new Set(["pm", "ls"]),
  pip: new Set(["list", "show", "freeze", "check"]),
  pip3: new Set(["list", "show", "freeze", "check"]),
  cargo: new Set(["tree", "metadata", "search", "info"]),
  go: new Set(["list", "version", "env"]),
  gem: new Set(["list", "info", "search", "query"]),
  composer: new Set(["show", "info", "search", "outdated", "audit"]),
  dotnet: new Set(["list", "nuget"]),
  flutter: new Set(["doctor", "devices", "config"]),
  dart: new Set(["info"]),
};

function isOffLevel(tokens: string[]): boolean {
  if (tokens.length === 0) return true;

  const cmd = getCommandName(tokens);
  const fullCmd = tokens[0]; // Keep full path for checking redirection targets
  const subCmd = tokens.length > 1 ? tokens[1].toLowerCase() : "";

  // Check if this is a file descriptor number from redirection parsing (e.g., "1" from 2>&1)
  if (tokens.length === 1 && FD_NUMBERS.has(fullCmd)) return true;

  // Check if this is a common redirection target (e.g., /dev/null)
  if (REDIRECTION_TARGETS.has(fullCmd)) return true;

  // Basic read-only commands
  if (OFF_COMMANDS.has(cmd)) return true;

  // Version checks
  if (tokens.includes("--version") || tokens.includes("-v") || tokens.includes("-V")) {
    return true;
  }

  // Git read operations
  if (cmd === "git" && subCmd && OFF_GIT_SUBCOMMANDS.has(subCmd)) {
    return true;
  }

  // Package manager read operations
  if (OFF_PACKAGE_SUBCOMMANDS[cmd]?.has(subCmd)) {
    return true;
  }

  return false;
}

// MEDIUM level - dev operations
const MEDIUM_PACKAGE_PATTERNS: Array<[string, RegExp]> = [
  // Node.js
  ["npm", /^(install|ci|add|remove|uninstall|update|rebuild|dedupe|prune|link|pack|run|test|start|build|exec)$/],
  ["yarn", /^(install|add|remove|upgrade|import|link|pack|run|test|start|build|dlx)?$/],
  ["pnpm", /^(install|add|remove|update|link|pack|run|test|start|build|dlx|exec)$/],
  ["bun", /^(install|add|remove|update|link|run|test|build|x)$/],
  ["npx", /./], // npx anything
  ["bunx", /./],
  ["pnpx", /./],

  // Python
  ["pip", /^install$/],
  ["pip3", /^install$/],
  ["pipenv", /^(install|update|sync|lock|uninstall)$/],
  ["poetry", /^(install|add|remove|update|lock|build)$/],
  ["conda", /^(install|update|remove|create)$/],
  ["uv", /^(pip|sync|lock)$/],
  ["python", /./],
  ["python3", /./],
  ["pytest", /./],

  // Rust
  ["cargo", /^(install|add|remove|fetch|update|build|run|test|check|clippy|fmt|doc|bench|clean)$/],
  ["rustc", /./],
  ["rustfmt", /./],

  // Go
  ["go", /^(get|mod|build|run|test|generate|fmt|vet|clean|install)$/],
  ["gofmt", /./],

  // Ruby
  ["gem", /^install$/],
  ["bundle", /^(install|update|add|remove|exec|binstubs)$/],
  ["bundler", /^(install|update|add|remove|exec)$/],
  ["rake", /./],
  ["rails", /^(generate|g|db|server|s|console|c|test|t)$/],
  ["rspec", /./],

  // PHP
  ["composer", /^(install|require|remove|update|dump-autoload|run-script)$/],
  ["php", /./],
  ["phpunit", /./],
  ["artisan", /./],

  // Java/Kotlin
  ["mvn", /^(install|compile|test|package|clean|dependency|verify)$/],
  ["gradle", /^(build|test|clean|assemble|dependencies|run|check)$/],
  ["gradlew", /./],

  // .NET
  ["dotnet", /^(restore|add|build|test|run|clean|publish|pack|new|watch)$/],
  ["nuget", /^install$/],

  // Dart/Flutter
  ["dart", /^(pub|run|compile|test|analyze|format|fix)$/],
  ["flutter", /^(pub|build|run|test|analyze|clean|create|doctor)$/],
  ["pub", /^(get|upgrade|downgrade|cache|deps|run)$/],

  // Swift
  ["swift", /^(package|build|test|run)$/],
  ["swiftc", /./],

  // Elixir
  ["mix", /^(deps|compile|test|run|ecto|phx)$/],
  ["elixir", /./],

  // Haskell
  ["cabal", /^(install|build|test|run|update)$/],
  ["stack", /^(install|build|test|run|setup)$/],
  ["ghc", /./],

  // Others
  ["nimble", /^install$/],
  ["zig", /^(build|test|fetch)$/],
  ["cmake", /./],
  ["make", /./],
  ["ninja", /./],
  ["meson", /./],

  // Linters/formatters
  ["eslint", /./],
  ["prettier", /./],
  ["black", /./],
  ["flake8", /./],
  ["mypy", /./],
  ["pyright", /./],
  ["tsc", /./],
  ["rubocop", /./],

  // Test runners
  ["jest", /./],
  ["mocha", /./],
  ["vitest", /./],

  // File ops
  ["mkdir", /./],
  ["touch", /./],
  ["cp", /./],
  ["mv", /./],
  ["ln", /./],

  // Database (local dev)
  ["prisma", /^(generate|migrate|db|studio)$/],
  ["sequelize", /^(db|migration)$/],
  ["typeorm", /^(migration)$/],
];

const MEDIUM_GIT_SUBCOMMANDS = new Set([
  "add", "commit", "pull", "fetch", "checkout", "switch", "branch",
  "merge", "rebase", "cherry-pick", "stash", "revert", "tag",
  "clean", "restore", "rm", "mv", "reset", // reset without --hard
]);

function isMediumLevel(tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const cmd = getCommandName(tokens);
  const subCmd = tokens.length > 1 ? tokens[1].toLowerCase() : "";

  // Git local operations (not push)
  if (cmd === "git") {
    if (subCmd === "push") return false; // push is HIGH
    if (subCmd === "reset" && tokens.includes("--hard")) return false; // hard reset is HIGH
    if (MEDIUM_GIT_SUBCOMMANDS.has(subCmd)) return true;
  }

  // Package managers and build tools
  for (const [pattern, subPattern] of MEDIUM_PACKAGE_PATTERNS) {
    if (cmd === pattern) {
      if (!subCmd || subPattern.test(subCmd)) {
        return true;
      }
    }
  }

  return false;
}

// HIGH level - git push, remote operations
function isHighLevel(tokens: string[]): boolean {
  if (tokens.length === 0) return false;

  const cmd = getCommandName(tokens);
  const subCmd = tokens.length > 1 ? tokens[1].toLowerCase() : "";
  const argsStr = tokens.slice(1).join(" ");

  // Git push
  if (cmd === "git" && subCmd === "push") return true;

  // Git reset --hard
  if (cmd === "git" && subCmd === "reset" && tokens.includes("--hard")) return true;

  // curl/wget piped to shell (detected at pipeline level)
  if (cmd === "curl" || cmd === "wget") return true;

  // Running remote scripts
  if (cmd === "bash" || cmd === "sh" || cmd === "zsh") {
    if (argsStr.includes("http://") || argsStr.includes("https://")) return true;
  }

  // Docker operations
  if (cmd === "docker" && ["push", "login", "logout"].includes(subCmd)) return true;

  // Deployment tools
  if (["kubectl", "helm", "terraform", "pulumi", "ansible"].includes(cmd)) return true;

  // SSH/SCP
  if (["ssh", "scp", "rsync"].includes(cmd)) return true;

  return false;
}

// ============================================================================
// CLASSIFY COMMAND
// ============================================================================

function classifySegment(tokens: string[]): Classification {
  if (tokens.length === 0) {
    return { level: "off", dangerous: false };
  }

  if (isDangerousCommand(tokens)) {
    return { level: "high", dangerous: true };
  }

  if (isOffLevel(tokens)) {
    return { level: "off", dangerous: false };
  }

  if (isMediumLevel(tokens)) {
    return { level: "medium", dangerous: false };
  }

  if (isHighLevel(tokens)) {
    return { level: "high", dangerous: false };
  }

  // Default: require HIGH for unknown commands
  return { level: "high", dangerous: false };
}

export function classifyCommand(command: string): Classification {
  const parsed = parseCommand(command);

  let maxLevel: PermissionLevel = "off";
  let dangerous = false;

  for (let i = 0; i < parsed.segments.length; i++) {
    const segment = parsed.segments[i];
    const segmentClass = classifySegment(segment);

    if (segmentClass.dangerous) {
      dangerous = true;
    }

    if (LEVEL_INDEX[segmentClass.level] > LEVEL_INDEX[maxLevel]) {
      maxLevel = segmentClass.level;
    }

    // Check for piping to shell
    if (i < parsed.segments.length - 1 && parsed.operators[i] === "|") {
      const nextCmd = getCommandName(parsed.segments[i + 1]);
      if (["bash", "sh", "zsh", "node", "python", "python3", "ruby", "perl"].includes(nextCmd)) {
        maxLevel = "high";
      }
    }
  }

  return { level: maxLevel, dangerous };
}
