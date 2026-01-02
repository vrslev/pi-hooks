# LSP Hook

Language Server Protocol diagnostics for pi-coding-agent.

## Highlights

- Runs `write`/`edit` results through the matching LSP and appends diagnostics to tool output
- Manages one LSP server per project root and reuses them across turns
- Supports TypeScript/JavaScript, Vue, Svelte, Dart/Flutter, Python, Go, and Rust

## Supported Languages

| Language | Server | Detection |
|----------|--------|-----------|
| TypeScript/JavaScript | `typescript-language-server` | `package.json`, `tsconfig.json` |
| Vue | `vue-language-server` | `package.json`, `vite.config.ts` |
| Svelte | `svelteserver` | `svelte.config.js` |
| Dart/Flutter | `dart language-server` | `pubspec.yaml` |
| Python | `pyright-langserver` | `pyproject.toml`, `requirements.txt` |
| Go | `gopls` | `go.mod` |
| Rust | `rust-analyzer` | `Cargo.toml` |

### Known Limitations

**rust-analyzer**: Very slow to initialize (30-60+ seconds) because it compiles the entire Rust project before returning diagnostics. This is a known rust-analyzer behavior, not a bug in this hook. For quick feedback, consider using `cargo check` directly.

## Usage

### Installation

1. Copy to hooks directory:
   ```bash
   cp -r lsp ~/.pi/agent/hooks/
   ```

2. Install dependencies:
   ```bash
   cd ~/.pi/agent/hooks/lsp
   npm install
   ```

Or add to global settings (`~/.pi/agent/settings.json`):
```json
{
  "hooks": [
    "/absolute/path/to/pi-hooks/lsp/lsp.ts"
  ]
}
```

### Prerequisites

Install the language servers you need:

```bash
# TypeScript/JavaScript
npm i -g typescript-language-server typescript

# Vue
npm i -g @vue/language-server

# Svelte
npm i -g svelte-language-server

# Python
npm i -g pyright

# Go (install gopls via go install)
go install golang.org/x/tools/gopls@latest

# Rust (install via rustup)
rustup component add rust-analyzer
```

The hook spawns binaries from your PATH.

## How It Works

1. On `session_start`, warms up LSP for detected project type
2. After each `write`/`edit`, sends file to LSP and waits for diagnostics
3. Appends errors/warnings to tool result so agent can fix them
4. Shows notification with diagnostic summary

## File Structure

| File | Purpose |
|------|---------|
| `lsp.ts` | Hook entry point |
| `lsp-hook.ts` | Event handlers and state management |
| `lsp-core.ts` | LSPManager class and server configurations |

## Testing

```bash
# Unit tests (root detection, configuration)
npm test

# Integration tests (spawns real language servers)
npm run test:integration

# Run rust-analyzer tests (slow, disabled by default)
RUST_LSP_TEST=1 npm run test:integration
```

## License

MIT
