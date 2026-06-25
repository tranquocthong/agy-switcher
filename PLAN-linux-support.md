# PLAN: Linux Support for `agyw`

**Phase:** Linux MVP  
**Date:** 2026-06-25  
**Research:** Complete — see `docker-research/` and research artifacts  
**Scope:** Extend `agyw` to run on Linux (file-based credential mode, no Keychain dependency)

---

## Background

`agyw` is currently macOS-only because `KeychainManager` calls the `security` CLI
(macOS-exclusive). On Linux, `agy` uses `libsecret`/GNOME Keyring **but** falls
back to the `antigravity-oauth-token` plaintext file when a keyring is unavailable
(e.g., Docker, SSH, headless).

**Key insight from research:** `antigravity-oauth-token` is already in `PRIVATE_ITEMS`
and handled by `FileSwapper`. On Linux, `KeychainManager` just needs to be a no-op —
the file swap alone is sufficient for multi-profile credential isolation.

**`GEMINI_FORCE_FILE_STORAGE=true`** — env var that forces `agy` to skip keyring and
use file-only storage. Users must set this on Linux for `agy` to persist tokens to file.

---

## Tasks

---

### Task 1 — Abstract `KeychainManager` into a `CredentialStore` interface

**Files:** `src/core/CredentialStore.ts` (new), `src/core/KeychainManager.ts` (modify),
`src/core/NoOpCredentialStore.ts` (new)

**Why:** Decouple the platform-specific credential operations from `ProfileManager`,
enabling clean platform dispatch in `factory.ts`.

#### 1a. Create `src/core/CredentialStore.ts`

```typescript
export interface CredentialStore {
  /** Snapshot the active credential from the system store into the profile dir. */
  save(profileName: string): Promise<void>;
  /** Restore the credential from the profile dir into the system store. */
  load(profileName: string): Promise<void>;
}
```

#### 1b. Update `KeychainManager.ts` — rename class, implement interface

- Rename class `KeychainManager` → `MacOSKeychainStore`
- Add `implements CredentialStore`
- Keep exact existing logic (no behavior change on macOS)
- Export an alias for backwards compat with existing tests:
  ```typescript
  export { MacOSKeychainStore as KeychainManager };
  ```

#### 1c. Create `src/core/NoOpCredentialStore.ts`

```typescript
import type { CredentialStore } from './CredentialStore.js';

/**
 * Linux credential store — no-op.
 *
 * On Linux, `agy` stores its OAuth token in `antigravity-oauth-token` (a plain
 * file), which FileSwapper already copies per-profile. No additional system
 * keyring interaction is needed. Users must run agy with
 * GEMINI_FORCE_FILE_STORAGE=true so agy writes to the file instead of
 * attempting libsecret/GNOME Keyring (which fails in headless environments).
 */
export class NoOpCredentialStore implements CredentialStore {
  async save(_profileName: string): Promise<void> {}
  async load(_profileName: string): Promise<void> {}
}
```

#### 1d. Update `ProfileManager.ts` constructor type

```typescript
// Before:
import type { KeychainManager } from './KeychainManager.js';
private keychainManager: KeychainManager,

// After:
import type { CredentialStore } from './CredentialStore.js';
private keychainManager: CredentialStore,
```

**Acceptance criteria:**
- [ ] `CredentialStore` interface exists with `save` and `load` signatures
- [ ] `MacOSKeychainStore` implements `CredentialStore` (behavior unchanged)
- [ ] `NoOpCredentialStore` implements `CredentialStore` (both methods are no-ops)
- [ ] `ProfileManager` accepts `CredentialStore`, not concrete `KeychainManager`
- [ ] All existing macOS tests still pass

---

### Task 2 — Adapt `ProcessGuard` for Linux

**File:** `src/core/ProcessGuard.ts`

**Why:** The `Antigravity.app` process pattern is macOS-specific. On Linux there is
no Antigravity IDE, only the `agy` CLI. `ps -axo pid=,command=` is POSIX-compatible
and works on Linux unchanged.

#### Changes

Guard the IDE check with a platform condition:

```typescript
// Before:
if (cmd.includes('Antigravity.app') && cmd.includes('language_server')) {
  found.push({ pid, label: 'Antigravity IDE (language_server)' });
  continue;
}

// After:
if (process.platform === 'darwin' &&
    cmd.includes('Antigravity.app') && cmd.includes('language_server')) {
  found.push({ pid, label: 'Antigravity IDE (language_server)' });
  continue;
}
```

Update the JSDoc:

```typescript
/**
 * Detects Antigravity processes that hold OAuth credentials in memory.
 *
 * macOS: checks for Antigravity IDE (language_server) and agy CLI.
 * Linux: checks for agy CLI only (no IDE on Linux).
 */
```

**Acceptance criteria:**
- [ ] `Antigravity.app` check guarded by `process.platform === 'darwin'`
- [ ] `agy` CLI detection unchanged and works on both platforms
- [ ] Existing ProcessGuard tests still pass

---

### Task 3 — Platform dispatch in `factory.ts`

**File:** `src/core/factory.ts`

**Why:** Single place for platform detection. Wire the correct `CredentialStore`
implementation based on `process.platform` at runtime.

#### Changes

```typescript
// Add imports
import type { CredentialStore } from './CredentialStore.js';
import { MacOSKeychainStore } from './KeychainManager.js';
import { NoOpCredentialStore } from './NoOpCredentialStore.js';

// Replace:
const keychainManager = new KeychainManager(profilesDir);

// With:
const credentialStore: CredentialStore =
  process.platform === 'darwin'
    ? new MacOSKeychainStore(profilesDir)
    : new NoOpCredentialStore();

// Update createProfileManager call — pass credentialStore instead of keychainManager
```

**Acceptance criteria:**
- [ ] `darwin` → `MacOSKeychainStore` (passes `profilesDir`)
- [ ] other platforms → `NoOpCredentialStore`
- [ ] No public API change to `createProfileManager` signature

---

### Task 4 — README and docs

**Files:** `README.md`, `LINUX.md` (new)

#### 4a. `README.md`

- Remove `> macOS only.` callout from top
- Update Requirements section to list Linux
- Add a short Linux Setup section explaining `GEMINI_FORCE_FILE_STORAGE=true`

#### 4b. Create `LINUX.md`

Full guide covering:
- Install `agy` on Linux via `install.sh`
- Why `GEMINI_FORCE_FILE_STORAGE=true` is required and how to set it permanently
- Headless auth flow: `agy auth login` shows URL → visit on another machine → paste code
- Docker usage (mount `~/.agyw` as a volume for persistence across runs)
- WSL2 notes (`DBUS_SESSION_BUS_ADDRESS` issues)
- Troubleshooting: token not persisted after restart → check env var is set

**Acceptance criteria:**
- [ ] `README.md` no longer says macOS-only
- [ ] Linux requirements + env var documented in README
- [ ] `LINUX.md` created with full install/auth/docker walkthrough

---

### Task 5 — Tests for Linux code paths

**Files:** new and updated test files under `src/core/__tests__/`

#### 5a. `NoOpCredentialStore.test.ts` (new)

```typescript
import { NoOpCredentialStore } from '../NoOpCredentialStore.js';

describe('NoOpCredentialStore', () => {
  it('save resolves without throwing', async () => {
    await expect(new NoOpCredentialStore().save('default')).resolves.toBeUndefined();
  });
  it('load resolves without throwing', async () => {
    await expect(new NoOpCredentialStore().load('default')).resolves.toBeUndefined();
  });
});
```

#### 5b. `ProcessGuard.test.ts` — add Linux platform cases

```typescript
describe('on linux', () => {
  const origPlatform = process.platform;
  beforeAll(() => Object.defineProperty(process, 'platform', { value: 'linux' }));
  afterAll(() => Object.defineProperty(process, 'platform', { value: origPlatform }));

  it('does not flag Antigravity IDE process (no IDE on Linux)', async () => {
    const guard = new ProcessGuard(() =>
      Promise.resolve('1234 /usr/lib/Antigravity.app/language_server\n'),
    );
    expect(await guard.findRunning()).toHaveLength(0);
  });

  it('still detects agy CLI on Linux', async () => {
    const guard = new ProcessGuard(() =>
      Promise.resolve('5678 /home/user/.local/bin/agy chat\n'),
    );
    const found = await guard.findRunning();
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('agy CLI');
  });
});
```

**Acceptance criteria:**
- [ ] `NoOpCredentialStore` unit tests pass
- [ ] `ProcessGuard` Linux platform tests pass
- [ ] All 82 existing unit tests still pass
- [ ] `npm test` exits 0

---

## Implementation Order

```
Task 1 (interface + NoOp)  ──┐
Task 2 (ProcessGuard)      ──┤──► Task 3 (factory wiring) ──► Task 5 (tests) ──► Task 4 (docs)
```

Tasks 1 and 2 are independent and can be done in parallel.

---

## Out of Scope (Phase 2)

- `libsecret`/`secret-tool` for desktop Linux keyring parity
- Windows support  
- Docker Compose / volume tooling
- `agyw doctor` Linux diagnostics

---

## Definition of Done

- [ ] Tasks 1–5 complete
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0 (TypeScript compiles clean)
- [ ] README no longer says "macOS only"
- [ ] `agyw` manually verified on `debian:bookworm` Docker container
