# LSP Hook for pi-coding-agent

This hook provides Language Server Protocol (LSP) integration for pi-coding-agent, automatically providing diagnostics feedback after file writes and edits.

## Features

- **Automatic diagnostics** - After writing or editing a file, LSP diagnostics (errors/warnings) are appended to the tool result
- **Multi-language support** - Supports many languages with focus on web and Flutter development
- **Smart server management** - LSP servers are spawned lazily and managed per project root
- **Workspace awareness** - Correctly handles monorepos and workspace configurations

## Supported Languages

### High Priority (Web & Flutter)

| Language | LSP Server | Extensions | Install Command |
|----------|------------|------------|-----------------|
| **Dart/Flutter** | dart language-server | `.dart` | Bundled with Dart/Flutter SDK |
| **TypeScript/JavaScript** | typescript-language-server | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `npm i -g typescript-language-server typescript` |
| **Vue** | vue-language-server | `.vue` | `npm i -g @vue/language-server` |
| **Svelte** | svelte-language-server | `.svelte` | `npm i -g svelte-language-server` |
| **Astro** | @astrojs/language-server | `.astro` | `npm i -g @astrojs/language-server` |

### Additional Languages

| Language | LSP Server | Extensions | Install Command |
|----------|------------|------------|-----------------|
| **Python** | pyright | `.py`, `.pyi` | `npm i -g pyright` |
| **Go** | gopls | `.go` | `go install golang.org/x/tools/gopls@latest` |
| **Rust** | rust-analyzer | `.rs` | Install via rustup or package manager |
| **JSON** | vscode-json-language-server | `.json` | `npm i -g vscode-langservers-extracted` |

## Installation

### Option 1: Project-local hook

```bash
# In your project root
mkdir -p .pi/hooks
cd .pi/hooks
npm init -y
npm install @mariozechner/pi-coding-agent vscode-jsonrpc vscode-languageserver-types

# Copy lsp-hook.ts to .pi/hooks/
```

### Option 2: Global hook

```bash
# Create global hooks directory
mkdir -p ~/.pi/agent/hooks
cd ~/.pi/agent/hooks
npm init -y
npm install @mariozechner/pi-coding-agent vscode-jsonrpc vscode-languageserver-types

# Copy lsp-hook.ts to ~/.pi/agent/hooks/
```

### Option 3: Custom path

Add to `~/.pi/agent/settings.json`:

```json
{
  "hooks": [
    "/path/to/lsp-hook.ts"
  ]
}
```

## Prerequisites

Make sure you have the required language servers installed for the languages you work with.

### Dart/Flutter

```bash
# Dart SDK or Flutter SDK should be in PATH
dart --version
# or
flutter --version
```

### TypeScript/JavaScript

```bash
npm install -g typescript typescript-language-server
```

### Vue

```bash
npm install -g @vue/language-server
```

### Svelte

```bash
npm install -g svelte-language-server
```

### Python

```bash
npm install -g pyright
```

### Go

```bash
go install golang.org/x/tools/gopls@latest
```

## How It Works

1. When pi starts, the hook initializes an LSP manager
2. When `write` or `edit` tools complete, the hook:
   - Detects the file extension
   - Finds the appropriate LSP server configuration
   - Locates the project root (e.g., `pubspec.yaml` for Dart, `package.json` for Node)
   - Spawns the LSP server if not already running
   - Opens/updates the file in the LSP
   - Waits for diagnostics (up to 2 seconds)
   - Appends formatted diagnostics to the tool result

## Example Output

When you write a Dart file with errors:

```
Successfully wrote 150 bytes to lib/main.dart

📋 LSP Diagnostics for main.dart:
  ERROR [10:5] [dart] Undefined name 'unknownVariable'.
  WARN [15:3] [dart] The value of the local variable 'unused' isn't used.
```

## Configuration

The hook uses sensible defaults and doesn't require configuration. However, you can modify `lsp-hook.ts` to:

- Add new language servers
- Change diagnostic timeout
- Filter diagnostic severity levels
- Customize output formatting

## Troubleshooting

### LSP server not starting

1. Check that the language server is installed and in PATH
2. Check console output for `[LSP]` prefixed messages
3. Ensure project root markers exist (e.g., `pubspec.yaml`, `package.json`)

### No diagnostics appearing

1. Some LSP servers need time to analyze the project on first run
2. Increase the timeout in `waitForDiagnostics` (default: 2000ms)
3. Check if the file extension is in the supported list

### Performance issues

- LSP servers are spawned lazily, so first file edit may be slower
- Each unique project root gets its own LSP server instance
- Servers are reused for subsequent edits

## Architecture

This hook:

- Uses `vscode-jsonrpc` for LSP communication
- Implements the minimal LSP client protocol needed for diagnostics
- Manages server lifecycle per project root
- Handles workspace configuration requests from servers

## License

MIT
