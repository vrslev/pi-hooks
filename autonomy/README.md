# Autonomy Hook

Layered permission control for `pi-coding-agent`. Choose how much freedom the agent gets.

## Autonomy Levels

| Level  | Description           | Bash Commands                              | File Writes              |
|--------|-----------------------|--------------------------------------------|--------------------------|
| Off    | Read-only mode        | `ls`, `cat`, `git status`, `npm list`...   | ❌ Blocked               |
| Low    | File edits            | Same as Off                                | ✅ Within project only   |
| Medium | Dev commands          | + `npm install`, `git commit`, `make`...   | ✅ Within project only   |
| High   | Full access           | ✅ Everything                              | ✅ Everywhere            |

**Key behaviors:**
- On first run, you're prompted to pick a level — saved per-project
- Mid-session escalation: if a command needs higher access, you can upgrade on the spot
- Dangerous commands (`rm -rf`, `sudo`, `git push --force`) always prompt, even at High
- Protected paths (`.env`, `.git/`, `node_modules/`) auto-allow at High, prompt at lower levels

## Command Classification

### Always Allowed (Allowlist)
`ls`, `pwd`, `echo`, `cat`, `head`, `tail`, `wc`, `which`, `whoami`, `date`, `uname`, `env`, `printenv`, `type`, `file`, `stat`, `df`, `du`, `free`, `uptime`

### Always Dangerous (Denylist)
These require confirmation even at high autonomy:
- `rm -rf`, `rm --recursive`, `rm --force`
- `sudo`
- `chmod 777`, `chown 777`
- `mkfs`, `dd of=`
- `shutdown`, `reboot`, `halt`, `poweroff`
- `git push --force`, `git reset --hard`
- `npm publish`
- `curl ... | sh`, `wget ... | sh`

### Medium-Level Commands
Allowed at medium+ autonomy:
- `npm install/ci/test/run/build/start`
- `yarn install/add/test/build/start`
- `pnpm install/add/test/build/start`
- `pip install`
- `cargo build/test/run`
- `go build/test/run/get`
- `make`
- `git add/commit/stash/checkout/branch/merge/rebase/fetch/pull`
- `mkdir`, `touch`

## Protected Paths

These paths are always blocked from writes:
- `.env`, `.env.local`, `.env.production`
- `.git/`
- `node_modules/`
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`

## Settings Storage

- **Git repos**: `<git-root>/.pi/settings.json`
- **Non-git directories**: `~/.pi/agent/settings.json`
- **Environment override**: Set `AUTONOMY_LEVEL=off|low|medium|high`

## Usage

Copy to your hooks directory:

```bash
# Project-local
mkdir -p .pi/hooks
cp autonomy.ts .pi/hooks/

# Or global
cp autonomy.ts ~/.pi/agent/hooks/
```

Or reference in `~/.pi/agent/settings.json`:

```json
{
  "hooks": ["/path/to/pi-hooks/autonomy/autonomy.ts"]
}
```

## First Run

On first run in a new project, you'll be prompted to select an autonomy level. The choice is saved and remembered for future sessions.

## License

MIT
