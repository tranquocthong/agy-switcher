# agyw — Agency Profile Switcher

Switch between multiple Google accounts in the [Antigravity CLI](https://antigravity.google) (`agy`) without logging out and back in.

Each profile stores its own private files and macOS Keychain auth token. Switching profiles swaps everything atomically — the next `agy` command runs as a different account.

> macOS only. Requires `agy` to be installed and initialized.

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

## How it works

- **Private files** (`installation_id`, `settings.json`, `updater`, etc.) are copied per-profile into `~/.agyw/profiles/<name>/` and swapped into `~/.gemini/antigravity-cli/` on each switch.
- **Shared files** (`conversations/`, `skills/`, `hooks/`, etc.) are symlinked to a common `~/.agyw/shared/` directory so all profiles share the same history and config.
- **Auth tokens** are saved and restored from the macOS Keychain so each profile stays logged in to its own Google account.

## Requirements

- macOS
- Node.js 18+
- `agy` (Google Antigravity CLI) installed and initialized
