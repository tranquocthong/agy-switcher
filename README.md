# agyw — Agency Profile Switcher

[![npm](https://img.shields.io/npm/v/agyw)](https://www.npmjs.com/package/agyw)

Switch between multiple Google accounts in the [Antigravity CLI](https://antigravity.google) (`agy`) without logging out and back in.

Each profile stores its own private files and OAuth credentials. Switching profiles swaps everything atomically — the next `agy` command runs as a different account.

## Install

```sh
npm install -g agyw
```

## Setup

```sh
# First time — imports your existing ~/.gemini/antigravity-cli/ as the "default" profile
agyw init
```

## Usage

```sh
agyw add <name>        # Create a new profile (clears auth so you can log in fresh)
agyw switch <name>     # Switch active profile (prefix matching: "agyw switch w" → "work")
agyw list              # List all profiles
agyw remove <name>     # Remove a profile
agyw status            # Show active profile and symlink health
agyw run <name>        # Switch profile and launch agy in one command
agyw doctor            # Diagnose symlink and config issues
```

## Typical workflow: adding a second account

```sh
agyw add work          # Creates "work" profile, switches to it, clears auth
agy auth login         # Log in with your work Google account
# ... use agy as work account ...
agyw switch default    # Switch back — restores your personal account automatically
```

## Important: quit Antigravity before switching

A running Antigravity IDE or `agy` process holds OAuth credentials in memory. If
a token refresh happens mid-switch, it can write the old credentials back to disk
and silently revert your switch.

To prevent this, `agyw switch` and `agyw run` **refuse to run while Antigravity
or `agy` is alive**. On macOS, fully quit the Antigravity app (Cmd+Q) and close
any `agy` sessions before switching. On Linux, close any active `agy` sessions.

## How it works

- **Private files** (`installation_id`, `antigravity-oauth-token`, `settings.json`, `updater`, etc.) are copied per-profile into `~/.agyw/profiles/<name>/` and swapped into `~/.gemini/antigravity-cli/` on each switch.
- **Shared files** (`conversations/`, `skills/`, `hooks/`, etc.) are symlinked to a common `~/.agyw/shared/` directory so all profiles share the same history and config.
- **Auth tokens** are saved and restored per-profile: macOS uses the native Keychain plus the `antigravity-oauth-token` file; Linux uses the file only. New profiles start with a clean state so `agy auth login` prompts for a fresh account.

## Requirements

- macOS or Linux (Ubuntu, Debian, Arch, Alpine/musl)
- Node.js 18+
- `agy` (Google Antigravity CLI) installed and initialized

> **macOS** uses the native Keychain for credential isolation.  
> **Linux** uses file-based credentials — run `agy` with
> `GEMINI_FORCE_FILE_STORAGE=true` so tokens are written to file.

## Linux Setup

On Linux, `agy` stores OAuth tokens in `~/.gemini/antigravity-cli/antigravity-oauth-token`
when `GEMINI_FORCE_FILE_STORAGE=true` is set. Without this, `agy` tries to use
`libsecret`/GNOME Keyring, which fails in headless and Docker environments.

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```sh
export GEMINI_FORCE_FILE_STORAGE=true
```

Then install `agy` and `agyw` normally:

```sh
curl -fsSL https://antigravity.google/cli/install.sh | bash
npm install -g agyw
agyw init
```

See [LINUX.md](./LINUX.md) for a detailed guide on headless auth and Docker usage.
