# checkpoint hook

Git-based checkpoint helper for [`pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## What it does

- Saves the full worktree (tracked + untracked) at the start of every turn
- Stores snapshots as Git refs so you can restore code while branching conversations
- Creates a "before restore" checkpoint automatically to avoid losing current work
- Offers restore options: files + conversation, conversation only, or files only

## Setup

```bash
cd checkpoint
npm install
```

Place `checkpoint.ts` where pi can load it:

- **Project scoped**: `mkdir -p .pi/hooks && cp checkpoint.ts .pi/hooks/`
- **Global**: add the absolute file path to `~/.pi/agent/settings.json` under `"hooks"`

## File structure

```
checkpoint/
  checkpoint.ts        # Hook entry point (event handlers)
  checkpoint-core.ts   # Core git operations (no pi dependencies)
  checkpoint-hook.ts   # Hook utilities (state, session, UI)
  tests/
    checkpoint.test.ts # Tests for core git operations
```

## Testing

```bash
npm test
```

## Requirements

- Git repository (hook auto-detects)
- Node.js 18+

## How it works

1. **On turn start**: Creates a checkpoint capturing HEAD, index, and worktree state
2. **On branch/tree navigation**: Prompts with restore options:
   - **Restore all**: Restore files and navigate conversation
   - **Conversation only**: Keep current files, navigate conversation
   - **Code only**: Restore files, stay at current conversation position
   - **Cancel**: Do nothing

Checkpoints are stored as Git refs under `refs/pi-checkpoints/` and persist across sessions.

## License

MIT (see repository root)
