# pi-hooks

Minimal reference hooks for [`pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## Included hooks

### `checkpoint/`

Git-based checkpoint system for restoring code state when branching conversations.

- Captures repo state at the start of every turn (tracked, staged, and untracked files)
- Stores checkpoints as Git refs for persistence across sessions
- Offers restore options: files + conversation, conversation only, or files only
- Automatically saves current state before restoring past snapshots

![Checkpoint Hook](assets/checkpoint-screenshot.png)

### `lsp/`

Language Server Protocol diagnostics after file changes.

- Runs LSP diagnostics after each `write`/`edit`
- Supports web, Flutter, and common backend stacks
- Manages LSP server lifecycles per project root

![LSP Hook](assets/lsp-screenshot.png)

### `permission/`

Layered permission control with four permission levels:

| Level  | Description           | What's allowed                                      |
|--------|-----------------------|-----------------------------------------------------|
| Off    | Read-only mode        | Only read commands (ls, cat, git status, etc.)      |
| Low    | File edits            | + write/edit files                                  |
| Medium | Dev commands          | + npm, git, make, cargo, etc.                       |
| High   | Full access           | Everything (dangerous commands still prompt)        |

On first run you pick a level; it's saved globally. You can escalate mid-session when needed.

![Permission Hook](assets/permission-screenshot.png)

## Usage

1. Install dependencies for hooks that need them:
   ```bash
   cd lsp && npm install
   cd ../permission && npm install
   ```

2. **Project-scoped setup** (`.pi/hooks/`):
   ```bash
   mkdir -p .pi/hooks
   cp checkpoint/checkpoint.ts .pi/hooks/
   cp lsp/lsp.ts .pi/hooks/
   cp permission/permission.ts .pi/hooks/
   ```
   pi automatically loads hooks from `.pi/hooks/`.

3. **Global setup** (`~/.pi/agent/hooks/`):
   ```bash
   mkdir -p ~/.pi/agent/hooks
   cp checkpoint/checkpoint.ts ~/.pi/agent/hooks/
   cp lsp/lsp.ts ~/.pi/agent/hooks/
   cp permission/permission.ts ~/.pi/agent/hooks/
   ```
   
   Or via `~/.pi/agent/settings.json`:
   ```json
   {
     "hooks": [
       "/absolute/path/to/pi-hooks/checkpoint/checkpoint.ts",
       "/absolute/path/to/pi-hooks/lsp/lsp.ts",
       "/absolute/path/to/pi-hooks/permission/permission.ts"
     ]
   }
   ```

4. See inline comments in each hook for configuration options.

## Testing

```bash
cd checkpoint && npm test
```

## License

MIT
