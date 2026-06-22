import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileSwapper } from '../FileSwapper.js';

let antigravityDir: string;
let profilesDir: string;
let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'agyw-fileswapper-'));
  antigravityDir = join(testRoot, 'antigravity');
  profilesDir = join(testRoot, 'profiles');
  await mkdir(antigravityDir, { recursive: true });
  await mkdir(profilesDir, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe('FileSwapper.save()', () => {
  it('copies a file from working dir to profile dir with matching content', async () => {
    await writeFile(join(antigravityDir, 'installation_id'), 'abc-123', 'utf-8');
    const swapper = new FileSwapper(antigravityDir, profilesDir, ['installation_id']);

    await swapper.save('work');

    const dest = join(profilesDir, 'work', 'installation_id');
    const content = await readFile(dest, 'utf-8');
    expect(content).toBe('abc-123');
  });

  it('copies a directory recursively from working dir to profile dir', async () => {
    const updaterDir = join(antigravityDir, 'updater');
    await mkdir(updaterDir, { recursive: true });
    await writeFile(join(updaterDir, 'config.json'), '{"version":1}', 'utf-8');
    await mkdir(join(updaterDir, 'sub'), { recursive: true });
    await writeFile(join(updaterDir, 'sub', 'data.bin'), 'binary-data', 'utf-8');

    const swapper = new FileSwapper(antigravityDir, profilesDir, ['updater']);
    await swapper.save('work');

    const destConfig = join(profilesDir, 'work', 'updater', 'config.json');
    const destSub = join(profilesDir, 'work', 'updater', 'sub', 'data.bin');
    expect(await readFile(destConfig, 'utf-8')).toBe('{"version":1}');
    expect(await readFile(destSub, 'utf-8')).toBe('binary-data');
  });

  it('silently skips items that do not exist in the working dir', async () => {
    const swapper = new FileSwapper(antigravityDir, profilesDir, [
      'missing_file',
      'also_missing/',
    ]);

    // Should not throw
    await expect(swapper.save('work')).resolves.toBeUndefined();
  });
});

describe('FileSwapper.load()', () => {
  it('copies a file from profile dir to working dir with matching content', async () => {
    const profileDir = join(profilesDir, 'personal');
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, 'user_settings.pb'), 'settings-blob', 'utf-8');

    const swapper = new FileSwapper(antigravityDir, profilesDir, ['user_settings.pb']);
    await swapper.load('personal');

    const dest = join(antigravityDir, 'user_settings.pb');
    const content = await readFile(dest, 'utf-8');
    expect(content).toBe('settings-blob');
  });

  it('copies a directory recursively from profile dir to working dir', async () => {
    const profileUpdater = join(profilesDir, 'personal', 'updater');
    await mkdir(join(profileUpdater, 'cache'), { recursive: true });
    await writeFile(join(profileUpdater, 'state.json'), '{"ready":true}', 'utf-8');
    await writeFile(join(profileUpdater, 'cache', 'pkg.tar'), 'tarball', 'utf-8');

    const swapper = new FileSwapper(antigravityDir, profilesDir, ['updater']);
    await swapper.load('personal');

    expect(await readFile(join(antigravityDir, 'updater', 'state.json'), 'utf-8')).toBe(
      '{"ready":true}',
    );
    expect(await readFile(join(antigravityDir, 'updater', 'cache', 'pkg.tar'), 'utf-8')).toBe(
      'tarball',
    );
  });

  it('does not touch files in antigravityDir that are not in privateItems', async () => {
    // Pre-existing file in working dir that is NOT in privateItems
    const existingFile = join(antigravityDir, 'should_remain.txt');
    await writeFile(existingFile, 'keep-me', 'utf-8');

    // Profile has its own installation_id
    const profileDir = join(profilesDir, 'work');
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, 'installation_id'), 'work-id', 'utf-8');

    const swapper = new FileSwapper(antigravityDir, profilesDir, ['installation_id']);
    await swapper.load('work');

    // should_remain.txt must still be there
    await expect(access(existingFile)).resolves.toBeUndefined();
    expect(await readFile(existingFile, 'utf-8')).toBe('keep-me');
  });

  it('removes a privateItems file from antigravityDir when the profile does not have it', async () => {
    // Simulate switching to a fresh profile that has no credentials
    await writeFile(join(antigravityDir, 'installation_id'), 'old-cred', 'utf-8');
    await writeFile(join(antigravityDir, 'user_settings.pb'), 'old-settings', 'utf-8');

    // New profile dir exists but credential files were deleted (as addProfile does)
    const profileDir = join(profilesDir, 'fresh');
    await mkdir(profileDir, { recursive: true });

    const swapper = new FileSwapper(antigravityDir, profilesDir, [
      'installation_id',
      'user_settings.pb',
    ]);
    await swapper.load('fresh');

    // Credential files must be gone from antigravityDir so agy starts unauthenticated
    await expect(access(join(antigravityDir, 'installation_id'))).rejects.toThrow();
    await expect(access(join(antigravityDir, 'user_settings.pb'))).rejects.toThrow();
  });
});

describe('FileSwapper performance', () => {
  it('save + load of 8 small files completes in under 100ms', async () => {
    const items = [
      'installation_id',
      'user_settings.pb',
      'auth_token',
      'session.json',
      'preferences.json',
      'cache_key',
      'device_id',
      'telemetry.json',
    ];

    for (const item of items) {
      await writeFile(join(antigravityDir, item), `content-of-${item}`, 'utf-8');
    }

    const swapper = new FileSwapper(antigravityDir, profilesDir, items);

    const start = Date.now();
    await swapper.save('perf-profile');
    await swapper.load('perf-profile');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
