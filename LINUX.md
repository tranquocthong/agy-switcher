# Using agyw on Linux

`agyw` fully supports Linux and headless environments (like Docker containers and CI pipelines). 

This guide covers how to set up `agy` and `agyw` on Linux, the differences in how credentials are handled compared to macOS, and solutions for common headless authentication issues.

## Understanding Credential Storage on Linux

On macOS, `agy` uses the native macOS Keychain to store your Google OAuth token securely. 

On Linux desktop environments, `agy` attempts to use the FreeDesktop Secret Service API (`libsecret` / GNOME Keyring) by default. However, **in headless environments (like Docker, SSH, or minimal VMs), there is no D-Bus session or keyring daemon running**. When this happens, `agy` will silently fail to persist the token, forcing you to log in every time you restart the container or open a new terminal session.

### The Solution: File-based Storage

`agy` has a built-in fallback: it can store the token in a standard encrypted file (`~/.gemini/antigravity-cli/antigravity-oauth-token`).

To force `agy` to use this file-based storage and skip the keyring entirely, you must set an environment variable:

```sh
export GEMINI_FORCE_FILE_STORAGE=true
```

**`agyw` works by swapping this file between profiles.** For `agyw` to work correctly on Linux, this variable must be set.

---

## Installation Guide

### 1. Set the Environment Variable

Add the variable to your shell profile so it's always active:

```sh
echo 'export GEMINI_FORCE_FILE_STORAGE=true' >> ~/.bashrc
source ~/.bashrc
```

### 2. Install Antigravity CLI (`agy`)

Google provides a native installation script for Linux. It installs a standalone compiled binary to `~/.local/bin/agy`.

```sh
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Make sure `~/.local/bin` is in your `$PATH`.

### 3. Install agyw

```sh
npm install -g agyw
```

### 4. Initialize and Log In

Run `agyw init` to set up the default profile, then log in:

```sh
agyw init
agy auth login
```

---

## Headless Authentication (Docker / SSH)

When you run `agy auth login` in an environment without a web browser (like a Docker container), `agy` will automatically detect the headless environment and use the **manual device-code flow**.

You will see output similar to this:

```
Please visit this URL to authorize the Antigravity CLI:
https://accounts.google.com/o/oauth2/auth?client_id=...

Enter the authorization code:
```

1. Copy the URL.
2. Paste it into a web browser on your host machine (or any machine with a browser).
3. Complete the Google Sign-In process.
4. Copy the authorization code shown in the browser.
5. Paste the code back into your headless terminal and press Enter.

Your token is now securely saved to the file, and `agyw` will manage it.

---

## Docker Quickstart

If you're using `agy` and `agyw` inside Docker, you'll want to mount the `~/.agyw` directory as a volume so your profiles and history persist between container restarts.

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y curl ca-certificates bash nodejs npm

# Create a non-root user
RUN useradd -m -s /bin/bash dev
USER dev
WORKDIR /home/dev

# Force file-based storage
ENV GEMINI_FORCE_FILE_STORAGE=true
ENV PATH="/home/dev/.local/bin:$PATH"

# Install agy and agyw
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash
RUN npm install -g agyw

CMD ["/bin/bash"]
```

To run the container and persist your profiles:

```sh
docker run -it \
  -v agyw_data:/home/dev/.agyw \
  my-agy-image
```

## Troubleshooting

### Token is lost after container restart
Ensure `GEMINI_FORCE_FILE_STORAGE=true` is set. Without it, `agy` might briefly hold the token in memory but fail to persist it to disk due to a missing keyring daemon.

### `agy auth login` URL is broken
In very narrow terminal windows, the CLI might hard-wrap the authorization URL with spaces, breaking the link. Widen your terminal window before running the command.

### `dbus-launch` or `keyring` errors in logs
If you see D-Bus or Secret Service errors in `~/.gemini/antigravity-cli/log/cli.log`, it means `GEMINI_FORCE_FILE_STORAGE=true` is not correctly set or exported in your environment.
