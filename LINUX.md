# agyw on Linux

**Status: best effort, not verified.** The isolation in `agyw exec` was verified on
macOS with `agy` 1.5.3. It has not been tested on Linux.

## Why Linux is different

On macOS the isolated `HOME` has no `~/Library`, so the Keychain is unreachable and
`agy` falls back to a token file inside the profile. On a Linux desktop, `agy` may
talk to the FreeDesktop Secret Service (GNOME Keyring / `libsecret`) over D-Bus, and
that keyring is not tied to `HOME`. If `agy` stored tokens there, every profile would
share one slot and accounts would overwrite each other.

To avoid that, `agyw exec` on non-macOS systems points `DBUS_SESSION_BUS_ADDRESS` at a
path that does not exist, so the keyring is unreachable and `agy` should take the same
"keyring failed, falling back to file storage" path it logs on macOS. `agyw exec`
prints a warning on Linux to remind you this is unverified.

Headless environments (Docker, SSH, CI) normally have no keyring daemon at all, so
this is the expected case there.

## Check it yourself before relying on it

```sh
agyw exec test            # log in with account A
# open another terminal
agyw exec test2           # log in with account B
agyw list                 # both should show LOGGED_IN yes
ls ~/.agyw/homes/test/.gemini/antigravity-cli/antigravity-oauth-token
ls ~/.agyw/homes/test2/.gemini/antigravity-cli/antigravity-oauth-token
```

Then start `agyw exec test` again and confirm it is still account A. If the two
accounts end up merged, do not use `agyw` on that machine and please open an issue.

## Headless login

`agy` detects a headless environment and uses a manual authorization-code flow:
open the printed URL in a browser on another machine, sign in, and paste the code
back into the terminal. Widen the terminal first; a hard-wrapped URL will not work.

## Docker

Persist the profile store as a volume so logins survive restarts:

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y curl ca-certificates bash nodejs npm
RUN useradd -m -s /bin/bash dev
USER dev
WORKDIR /home/dev
ENV PATH="/home/dev/.local/bin:$PATH"
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash
RUN npm install -g agyw
CMD ["/bin/bash"]
```

```sh
docker run -it -v agyw_data:/home/dev/.agyw my-agy-image
```

## Troubleshooting

- **Asked to log in every time:** the token file is not being saved. Look for D-Bus or
  keyring errors in `~/.agyw/homes/<name>/.gemini/antigravity-cli/log/`.
- **Accounts merged:** see "Check it yourself" above.
