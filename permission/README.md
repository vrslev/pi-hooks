# Permission Hook

Layered permission control for pi-coding-agent.

## Levels

| Level | Description | Allowed Operations |
|-------|-------------|-------------------|
| **off** | Read-only (default) | `cat`, `ls`, `grep`, `git status/log/diff`, `npm list` |
| **low** | File operations | + `write`/`edit` files in project |
| **medium** | Dev operations | + `npm install`, `git commit`, build commands |
| **high** | Full operations | + `git push`, deployments, scripts |

**Dangerous commands** (always prompt, even at high): `sudo`, `rm -rf`, `chmod 777`, `dd`, `mkfs`

## Usage

### Interactive Mode

```bash
# Hook loads automatically from ~/.pi/agent/hooks/ or .pi/hooks/
pi
```

**Commands:**
- `/permission` - Show selector to change level
- `/permission medium` - Set level directly (asks session/global)

**When a command needs higher permission:**
```
🔒 Requires Medium: npm install lodash

  [Allow once]           → Execute this command only
  [Allow all (Medium)]   → Update global settings and execute
  [Cancel]               → Don't execute
```

### Print Mode

```bash
# Set level via environment variable
PI_PERMISSION_LEVEL=medium pi -p "install deps and run tests"

# Bypass all permission checks (CI/containers - dangerous!)
PI_PERMISSION_LEVEL=bypassed pi -p "do anything"
```

**If permission is insufficient:**
The command is blocked but execution continues. The agent receives:
```
Blocked by permission (off). Command: npm install lodash
Allowed at this level: read-only (cat, ls, grep, git status/diff/log, npm list, version checks)
User can re-run with: PI_PERMISSION_LEVEL=medium pi -p "..."
```

The agent can then work around the limitation or inform the user.

## Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `PI_PERMISSION_LEVEL` | `off`, `low`, `medium`, `high`, `bypassed` | Set permission level |

## Settings

Global settings stored in `~/.pi/agent/settings.json`:

```json
{
  "permissionLevel": "medium"
}
```

## Command Classification

### Off Level (Read-only)
- File reading: `cat`, `less`, `head`, `tail`, `bat`
- Directory: `ls`, `tree`, `pwd`, `find`, `fd`
- Search: `grep`, `rg`, `ag`
- Info: `echo`, `whoami`, `date`, `uname`, `ps`, `env`
- Git read: `git status`, `git log`, `git diff`, `git show`, `git branch`
- Package info: `npm list`, `pip list`, `cargo tree`

### Medium Level (Dev Operations)
- **Node.js**: `npm install/run/test`, `yarn`, `pnpm`, `bun`
- **Python**: `pip install`, `poetry`, `pytest`, `python`
- **Rust**: `cargo build/test/run`
- **Go**: `go build/test/run`, `go get`
- **Ruby**: `gem install`, `bundle`, `rake`, `rails`
- **PHP**: `composer install`, `php`, `artisan`
- **Java**: `mvn`, `gradle`
- **.NET**: `dotnet build/test/run`
- **Dart/Flutter**: `dart pub get`, `flutter build/run`
- **Git local**: `git add`, `git commit`, `git pull`, `git checkout`, `git merge`
- **Build tools**: `make`, `cmake`, `ninja`
- **Linters**: `eslint`, `prettier`, `black`, `rustfmt`
- **File ops**: `mkdir`, `touch`, `cp`, `mv`

### High Level (Full Operations)
- `git push`
- `git reset --hard`
- `curl`/`wget` (especially piped to shell)
- `docker push`
- `kubectl`, `helm`, `terraform`
- `ssh`, `scp`, `rsync`

### Dangerous (Always Prompt)
- `sudo` (any form)
- `rm` with `-r` AND `-f` flags
- `chmod 777` or `a+rwx`
- `dd of=/dev/...`
- `mkfs`, `fdisk`, `parted`
- `shutdown`, `reboot`

## Installation

1. Copy to hooks directory:
   ```bash
   cp -r permission ~/.pi/agent/hooks/
   ```

2. Install dependencies:
   ```bash
   cd ~/.pi/agent/hooks/permission
   npm install
   ```

## License

MIT
