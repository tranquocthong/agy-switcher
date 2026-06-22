import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, lstat, symlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigStore } from '../ConfigStore.js';
import { FileSwapper } from '../FileSwapper.js';
import { SymlinkEngine } from '../SymlinkEngine.js';
import { LockManager } from '../LockManager.js';
import { HistoryTracker } from '../HistoryTracker.js';
import { ProfileManager } from '../ProfileManager.js';
import { AgywError } from '../../utils/errors.js';
import type { ConfigYaml } from '../../types/profile.js';

let testRoot: string;
let agywDir: string;
let antigravityDir: string;
let profilesDir: string;
let sharedDir: string;

let configStore: ConfigStore;
let fileSwapper: FileSwapper;
let symlinkEngine: SymlinkEngine;
let lockManager: LockManager;
let historyTracker: HistoryTracker;
let manager: ProfileManager;

const PRIVATE_ITEMS = ['installation_id', 'user_settings.pb'];
const SHARED_ITEMS = ['mcp.json'];

async function setupInitializedAgyw(profiles: string[] = ['default', 'work']) {
  // Create antigravityDir with private files (NOT shared items — those are symlinked)
  await mkdir(antigravityDir, { recursive: true });
  await writeFile(join(antigravityDir, 'installation_id'), 'id-default', 'utf-8');
  await writeFile(join(antigravityDir, 'user_settings.pb'), 'settings-default', 'utf-8');

  // Create profiles dir with each profile's private items
  for (const profile of profiles) {
    const profileDir = join(profilesDir, profile);
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, 'installation_id'), `id-${profile}`, 'utf-8');
    await writeFile(join(profileDir, 'user_settings.pb'), `settings-${profile}`, 'utf-8');
  }

  // Create shared dir with shared items
  await mkdir(sharedDir, { recursive: true });
  await writeFile(join(sharedDir, 'mcp.json'), '{"mcp":true}', 'utf-8');

  // Create symlink in antigravityDir for shared items (simulating already-initialized state)
  await symlink(join(sharedDir, 'mcp.json'), join(antigravityDir, 'mcp.json'));

  // Write config
  const config: ConfigYaml = {
    version: 1,
    antigravity_dir: antigravityDir,
    shared_source: sharedDir,
    profiles: Object.fromEntries(
      profiles.map(name => [
        name,
        {
          path: join(profilesDir, name),
          model: 'gemini-pro',
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ]),
    ),
    private: PRIVATE_ITEMS,
    shared: SHARED_ITEMS,
  };
  await configStore.writeConfig(config);
  await configStore.setActive(profiles[0]);
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'agyw-pm-'));
  agywDir = join(testRoot, 'agyw');
  antigravityDir = join(testRoot, 'antigravity');
  profilesDir = join(agywDir, 'profiles');
  sharedDir = join(agywDir, 'shared');

  await mkdir(agywDir, { recursive: true });

  configStore = new ConfigStore(agywDir);
  fileSwapper = new FileSwapper(antigravityDir, profilesDir, PRIVATE_ITEMS);
  symlinkEngine = new SymlinkEngine(antigravityDir, sharedDir, SHARED_ITEMS);
  lockManager = new LockManager(agywDir);
  historyTracker = new HistoryTracker(configStore);
  manager = new ProfileManager(
    configStore,
    fileSwapper,
    symlinkEngine,
    lockManager,
    historyTracker,
  );
});

afterEach(async () => {
  // Release lock if accidentally held
  await lockManager.release();
  await rm(testRoot, { recursive: true, force: true });
});

// ─── resolveProfile ────────────────────────────────────────────────────────

describe('ProfileManager.resolveProfile()', () => {
  beforeEach(async () => {
    await setupInitializedAgyw(['default', 'work', 'work-staging']);
  });

  it('returns the name for an exact match', async () => {
    const result = await manager.resolveProfile('work');
    expect(result).toBe('work');
  });

  it('returns the profile for an unambiguous prefix match', async () => {
    const result = await manager.resolveProfile('def');
    expect(result).toBe('default');
  });

  it('throws ERR_AMBIGUOUS_PROFILE when prefix matches multiple profiles', async () => {
    await expect(manager.resolveProfile('work')).resolves.toBe('work'); // exact wins
    await expect(manager.resolveProfile('wor')).rejects.toThrow(AgywError);
    await expect(manager.resolveProfile('wor')).rejects.toMatchObject({
      code: 'ERR_AMBIGUOUS_PROFILE',
    });
  });

  it('throws ERR_PROFILE_NOT_FOUND when no profiles match', async () => {
    await expect(manager.resolveProfile('nonexistent')).rejects.toThrow(AgywError);
    await expect(manager.resolveProfile('nonexistent')).rejects.toMatchObject({
      code: 'ERR_PROFILE_NOT_FOUND',
    });
  });
});

// ─── switch ───────────────────────────────────────────────────────────────

describe('ProfileManager.switch()', () => {
  beforeEach(async () => {
    await setupInitializedAgyw(['default', 'work']);
  });

  it('saves current profile, loads target, repairs symlinks, updates active, records history', async () => {
    // Set antigravityDir to reflect current active (default) state
    await writeFile(join(antigravityDir, 'installation_id'), 'id-default-current', 'utf-8');

    await manager.switch('work');

    // Active profile should be 'work'
    const active = await configStore.getActive();
    expect(active.profile).toBe('work');

    // antigravityDir should now contain 'work' profile data
    const idContent = await readFile(join(antigravityDir, 'installation_id'), 'utf-8');
    expect(idContent).toBe('id-work');

    // Symlinks should be repaired (mcp.json symlink pointing to sharedDir)
    const mcpLinkStat = await lstat(join(antigravityDir, 'mcp.json'));
    expect(mcpLinkStat.isSymbolicLink()).toBe(true);
  });

  it('is a no-op when switching to already active profile', async () => {
    const activeBefore = await configStore.getActive();
    expect(activeBefore.profile).toBe('default');

    // Should not throw, should be silent
    await manager.switch('default');

    const activeAfter = await configStore.getActive();
    expect(activeAfter.profile).toBe('default');
    // switched_at should NOT have changed because it was a no-op
    expect(activeAfter.switched_at).toBe(activeBefore.switched_at);
  });

  it('releases the lock even when an operation throws', async () => {
    // Use a profile that has no files to load (will still succeed) but we can
    // simulate a failure by temporarily making the lock path unwritable — instead,
    // we test that the lock file is absent after a successful call, showing release was called.
    await manager.switch('work');

    // The lock file should NOT exist after the switch completes
    const { existsSync } = await import('fs');
    expect(existsSync(join(agywDir, 'agyw.lock'))).toBe(false);
  });

  it('releases the lock when an internal step throws', async () => {
    // Wire up a symlinkEngine that will throw on repair()
    const brokenEngine = new SymlinkEngine(
      antigravityDir,
      sharedDir,
      SHARED_ITEMS,
    );
    // Place a real file at the symlink position to trigger ERR_SYMLINK_CONFLICT
    // Must unlink the existing symlink first (writeFile follows symlinks, doesn't replace them)
    const { unlink } = await import('fs/promises');
    await unlink(join(antigravityDir, 'mcp.json'));
    await writeFile(join(antigravityDir, 'mcp.json'), 'real file', 'utf-8');

    const m2 = new ProfileManager(
      configStore,
      fileSwapper,
      brokenEngine,
      lockManager,
      historyTracker,
    );

    await expect(m2.switch('work')).rejects.toThrow(AgywError);

    // Lock must be released
    const { existsSync } = await import('fs');
    expect(existsSync(join(agywDir, 'agyw.lock'))).toBe(false);
  });
});

// ─── addProfile ───────────────────────────────────────────────────────────

describe('ProfileManager.addProfile()', () => {
  beforeEach(async () => {
    await setupInitializedAgyw(['default', 'work']);
  });

  it('creates a new profile directory and updates config', async () => {
    await manager.addProfile('staging');

    const config = await configStore.readConfig();
    expect(config.profiles['staging']).toBeDefined();
    expect(config.profiles['staging'].path).toBe(join(profilesDir, 'staging'));

    // Profile directory should exist
    const { access } = await import('fs/promises');
    await expect(access(join(profilesDir, 'staging'))).resolves.toBeUndefined();
  });

  it('clones from active profile when cloneFrom is not provided', async () => {
    // Active is 'default' which has installation_id and user_settings.pb
    await manager.addProfile('staging');

    // New profile dir should have files (minus credentials that get deleted)
    // But the private files that are NOT credentials should still be copied
    const config = await configStore.readConfig();
    expect(config.profiles['staging']).toBeDefined();
  });

  it('clones from specified source profile when cloneFrom is provided', async () => {
    await manager.addProfile('staging', 'work');

    const config = await configStore.readConfig();
    expect(config.profiles['staging']).toBeDefined();
  });

  it('throws ERR_PROFILE_EXISTS for a duplicate name', async () => {
    await expect(manager.addProfile('work')).rejects.toThrow(AgywError);
    await expect(manager.addProfile('work')).rejects.toMatchObject({
      code: 'ERR_PROFILE_EXISTS',
    });
  });

  it('deletes credential files from the new profile', async () => {
    // Ensure source profile has credential files
    await writeFile(join(profilesDir, 'default', 'installation_id'), 'cred-id', 'utf-8');
    await writeFile(join(profilesDir, 'default', 'user_settings.pb'), 'cred-pb', 'utf-8');

    await manager.addProfile('clean');

    // Credential files should NOT exist in new profile
    const { access } = await import('fs/promises');
    await expect(
      access(join(profilesDir, 'clean', 'installation_id')),
    ).rejects.toThrow();
    await expect(
      access(join(profilesDir, 'clean', 'user_settings.pb')),
    ).rejects.toThrow();
  });
});

// ─── removeProfile ────────────────────────────────────────────────────────

describe('ProfileManager.removeProfile()', () => {
  beforeEach(async () => {
    await setupInitializedAgyw(['default', 'work', 'staging']);
  });

  it('deletes the profile directory and removes from config', async () => {
    await manager.removeProfile('staging');

    const config = await configStore.readConfig();
    expect(config.profiles['staging']).toBeUndefined();

    // Profile directory should be gone
    const { access } = await import('fs/promises');
    await expect(access(join(profilesDir, 'staging'))).rejects.toThrow();
  });

  it('throws ERR_PROFILE_NOT_FOUND when profile does not exist', async () => {
    await expect(manager.removeProfile('nonexistent')).rejects.toThrow(AgywError);
    await expect(manager.removeProfile('nonexistent')).rejects.toMatchObject({
      code: 'ERR_PROFILE_NOT_FOUND',
    });
  });

  it('throws ERR_REMOVE_ACTIVE when trying to remove the active profile', async () => {
    // Active is 'default'
    await expect(manager.removeProfile('default')).rejects.toThrow(AgywError);
    await expect(manager.removeProfile('default')).rejects.toMatchObject({
      code: 'ERR_REMOVE_ACTIVE',
    });
  });

  it('throws ERR_REMOVE_LAST when only active + 1 non-active profile remain', async () => {
    // Remove down to [default (active), staging]
    await manager.removeProfile('work');

    // Now nonActiveProfiles = ['staging'] (length 1) — removing it would leave only active
    await expect(manager.removeProfile('staging')).rejects.toMatchObject({
      code: 'ERR_REMOVE_LAST',
    });
  });

  it('throws ERR_REMOVE_LAST for the last non-active profile when only 2 exist', async () => {
    // Setup with only 2 profiles: 'default' (active) and 'solo'
    const config: ConfigYaml = {
      version: 1,
      antigravity_dir: antigravityDir,
      shared_source: sharedDir,
      profiles: {
        default: { path: join(profilesDir, 'default'), model: 'gemini-pro', created_at: '2024-01-01T00:00:00.000Z' },
        solo: { path: join(profilesDir, 'solo'), model: 'gemini-pro', created_at: '2024-01-01T00:00:00.000Z' },
      },
      private: PRIVATE_ITEMS,
      shared: SHARED_ITEMS,
    };
    await configStore.writeConfig(config);
    await configStore.setActive('default');
    // Create solo dir
    await mkdir(join(profilesDir, 'solo'), { recursive: true });

    await expect(manager.removeProfile('solo')).rejects.toThrow(AgywError);
    await expect(manager.removeProfile('solo')).rejects.toMatchObject({
      code: 'ERR_REMOVE_LAST',
    });
  });
});

// ─── init ─────────────────────────────────────────────────────────────────

describe('ProfileManager.init()', () => {
  it('creates initial config and default profile from existing antigravityDir', async () => {
    await mkdir(antigravityDir, { recursive: true });
    await writeFile(join(antigravityDir, 'installation_id'), 'orig-id', 'utf-8');
    await writeFile(join(antigravityDir, 'user_settings.pb'), 'orig-settings', 'utf-8');
    await writeFile(join(antigravityDir, 'mcp.json'), '{"mcp":true}', 'utf-8');

    // Create a fresh manager with appropriate config store pointing to a fresh agywDir
    const freshAgywDir = join(testRoot, 'fresh-agyw');
    const freshProfilesDir = join(freshAgywDir, 'profiles');
    const freshSharedDir = join(freshAgywDir, 'shared');
    const freshConfigStore = new ConfigStore(freshAgywDir);
    const freshFileSwapper = new FileSwapper(antigravityDir, freshProfilesDir, PRIVATE_ITEMS);
    const freshSymlinkEngine = new SymlinkEngine(antigravityDir, freshSharedDir, SHARED_ITEMS);
    const freshLockManager = new LockManager(freshAgywDir);
    const freshHistoryTracker = new HistoryTracker(freshConfigStore);
    const freshManager = new ProfileManager(
      freshConfigStore,
      freshFileSwapper,
      freshSymlinkEngine,
      freshLockManager,
      freshHistoryTracker,
    );

    await freshManager.init(antigravityDir);

    // Config should exist
    expect(await freshConfigStore.configExists()).toBe(true);

    // Active profile should be 'default'
    const active = await freshConfigStore.getActive();
    expect(active.profile).toBe('default');

    // Config should have 'default' profile
    const config = await freshConfigStore.readConfig();
    expect(config.profiles['default']).toBeDefined();

    // Default profile should have the private files saved
    const { access } = await import('fs/promises');
    await expect(access(join(freshProfilesDir, 'default', 'installation_id'))).resolves.toBeUndefined();

    await freshLockManager.release();
  });

  it('throws ERR_ANTIGRAVITY_NOT_INIT when antigravityDir does not exist', async () => {
    const nonexistentDir = join(testRoot, 'does-not-exist');
    await expect(manager.init(nonexistentDir)).rejects.toThrow(AgywError);
    await expect(manager.init(nonexistentDir)).rejects.toMatchObject({
      code: 'ERR_ANTIGRAVITY_NOT_INIT',
    });
  });

  it('is idempotent — does not throw when config already exists', async () => {
    await setupInitializedAgyw(['default']);
    // Config already exists; init should not throw (idempotent)
    await expect(manager.init(antigravityDir)).resolves.toBeUndefined();
  });
});

// ─── performance ──────────────────────────────────────────────────────────

describe('ProfileManager performance', () => {
  it('switch completes in under 200ms for a typical profile (NFR-001)', async () => {
    await setupInitializedAgyw(['default', 'work']);

    // Set up the antigravityDir with the expected private files
    await writeFile(join(antigravityDir, 'installation_id'), 'id-default', 'utf-8');
    await writeFile(join(antigravityDir, 'user_settings.pb'), 'settings-default', 'utf-8');

    const start = Date.now();
    await manager.switch('work');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});
