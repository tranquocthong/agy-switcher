# agyw - multiple Google accounts for agy

[![npm](https://img.shields.io/npm/v/agyw)](https://www.npmjs.com/package/agyw)

Run several Google accounts in the [Antigravity CLI](https://antigravity.google) (`agy`)
side by side. Each profile is an isolated `HOME` with its own login and history, so
there is nothing to switch, no need to quit `agy` first, and two accounts can run in
two terminals at the same time.

> **0.3.0 is a breaking change.** `switch`, `add`, `init` and `status` are gone;
> `agyw exec <name>` replaces them. See [Upgrading](#upgrading-from-02x).

## Install

```sh
npm install -g agyw
```

## Usage

```sh
agyw exec <name> [agy args...]   # run agy as profile <name> (created on first use)
agyw run  <name> [agy args...]   # alias of exec
agyw list                        # profiles and whether each is logged in
agyw remove <name> --yes         # delete a profile (login and history included)
agyw doctor [--fix]              # check every profile is properly isolated
```

## Typical workflow: two or more accounts

```sh
# One time per account: the first run opens agy's login, sign in with that account.
agyw exec work
agyw exec personal

# Every day: open a terminal tab per account and start agy as that profile.
agyw exec work          # tab 1
agyw exec personal      # tab 2, at the same time if you like
agyw exec work -c       # arguments after the name go straight to agy

agyw list               # NAME / LOGGED_IN
```

Handy shell aliases:

```sh
alias agw='agyw exec work'
alias agp='agyw exec personal'
```

Notes:

- Plain `agy` (no `agyw`) keeps using your original account in the real `~/.gemini`.
  It is not touched by agyw, so it works as your "default" profile.
- Inside a session, `$AGYW_PROFILE` holds the profile name and `$AGYW_REAL_HOME`
  your real home directory.
- Profile names: letters, digits, `-` and `_`, up to 32 characters.
- The first login of a profile waits about 5 seconds while `agy` gives up on the
  keychain and falls back to a file. Later runs start normally.

## How it works

`agyw exec work` starts `agy` with `HOME=~/.agyw/homes/work`.

- All `agy` state (`~/.gemini/antigravity-cli/`, including the login token) lives
  inside that directory. The real `~/.gemini` and the global Keychain slot are
  never read or written.
- That home has no `~/Library`, so the macOS Keychain is unreachable and `agy`
  stores its token in a file (`antigravity-oauth-token`) inside the profile. This is
  what isolates the accounts. `agyw doctor` flags a profile that has a `Library`.
- Your dotfiles (`.gitconfig`, `.ssh`, `.config`, ...) are symlinked into the profile
  home so `git`, `ssh`, `node` and friends keep working.
- Only `skills/`, `hooks/` and `knowledge/` are shared between profiles (symlinks to
  `~/.agyw/shared/`). Conversations and cache are per account.

### Known limits

- Tools that keep credentials in the macOS Keychain (`git` with `osxkeychain`, `gh`
  without `GH_TOKEN`) cannot see them from inside a profile. Use `GH_TOKEN`, an SSH
  key, or a credential store that is not the Keychain.
- Verified on macOS with `agy` 1.5.3 only. Linux support is best effort, see
  [LINUX.md](./LINUX.md).

## Upgrading from 0.2.x

0.2.x swapped files in `~/.gemini` and the global Keychain slot. That design could
not be made safe while `agy` was running and, in 0.1.x, merged several profiles into
one account. 0.3.0 does not read the old data:

1. Close any running `agy`.
2. Log in again once per account: `agyw exec <name>`.
3. When you are happy, clean up the old store: `rm -rf ~/.agyw/profiles
   ~/.agyw/config.yaml ~/.agyw/active-profile.json ~/.agyw/history.yaml`.
   Keep `~/.agyw/shared` and `~/.agyw/homes`.

If an old `agyw switch` left `builtin/` or `keybindings.json` in `~/.gemini` as
symlinks to `~/.agyw/shared`, replace them with real copies:
`cp -R ~/.agyw/shared/builtin ~/.gemini/antigravity-cli/builtin.new && rm ~/.gemini/antigravity-cli/builtin && mv ~/.gemini/antigravity-cli/builtin.new ~/.gemini/antigravity-cli/builtin`
(same idea for `keybindings.json`), or just let `agy` regenerate them.

## Requirements

- macOS (verified) or Linux (best effort)
- Node.js 22+
- `agy` installed and on your `PATH`
