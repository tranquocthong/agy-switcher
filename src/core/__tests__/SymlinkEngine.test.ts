import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SymlinkEngine } from '../SymlinkEngine.js';

let testRoot: string;
let antigravityDir: string;
let sharedDir: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'agyw-symlink-'));
  antigravityDir = join(testRoot, 'antigravity');
  sharedDir = join(testRoot, 'shared');
  await mkdir(antigravityDir, { recursive: true });
  await mkdir(sharedDir, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe('SymlinkEngine.repair()', () => {
  it('creates new symlinks pointing to sharedDir targets', async () => {
    const engine = new SymlinkEngine(antigravityDir, sharedDir, [
      'keybindings.json',
      'brain/',
    ]);

    // Create a shared file so the symlink target can be verified
    await writeFile(join(sharedDir, 'keybindings.json'), '{}', 'utf-8');

    await engine.repair();

    // Verify symlink for file item
    const { lstat, readlink } = await import('fs/promises');
    const fileLinkStat = await lstat(join(antigravityDir, 'keybindings.json'));
    expect(fileLinkStat.isSymbolicLink()).toBe(true);
    expect(await readlink(join(antigravityDir, 'keybindings.json'))).toBe(
      join(sharedDir, 'keybindings.json'),
    );

    // Verify symlink for directory item (trailing slash stripped)
    const dirLinkStat = await lstat(join(antigravityDir, 'brain'));
    expect(dirLinkStat.isSymbolicLink()).toBe(true);
    expect(await readlink(join(antigravityDir, 'brain'))).toBe(join(sharedDir, 'brain'));
  });

  it('is idempotent — running repair() twice does not error', async () => {
    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    await writeFile(join(sharedDir, 'keybindings.json'), '{}', 'utf-8');

    await engine.repair();
    await expect(engine.repair()).resolves.toBeUndefined();
  });

  it('fixes a broken symlink that points to the wrong target', async () => {
    const wrongTarget = join(testRoot, 'wrong-target.json');
    await writeFile(wrongTarget, 'wrong', 'utf-8');

    // Plant a symlink pointing to the wrong location
    await symlink(wrongTarget, join(antigravityDir, 'keybindings.json'));

    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    await writeFile(join(sharedDir, 'keybindings.json'), '{}', 'utf-8');

    await engine.repair();

    const { readlink } = await import('fs/promises');
    expect(await readlink(join(antigravityDir, 'keybindings.json'))).toBe(
      join(sharedDir, 'keybindings.json'),
    );
  });

  it('adopts a real file into sharedDir when no shared target exists yet, then symlinks it', async () => {
    // Place a real (non-symlink) file where the symlink should go; no shared target yet.
    await writeFile(join(antigravityDir, 'keybindings.json'), 'real content', 'utf-8');

    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    await engine.repair();

    const { lstat, readlink } = await import('fs/promises');
    const linkStat = await lstat(join(antigravityDir, 'keybindings.json'));
    expect(linkStat.isSymbolicLink()).toBe(true);
    expect(await readlink(join(antigravityDir, 'keybindings.json'))).toBe(
      join(sharedDir, 'keybindings.json'),
    );
    expect(await readFile(join(sharedDir, 'keybindings.json'), 'utf-8')).toBe('real content');
  });

  it('adopts a real directory into sharedDir when no shared target exists yet, then symlinks it', async () => {
    // Place a real directory where the symlink should go; no shared target yet.
    await mkdir(join(antigravityDir, 'brain'), { recursive: true });
    await writeFile(join(antigravityDir, 'brain', 'note.txt'), 'hello', 'utf-8');

    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['brain/']);
    await engine.repair();

    const { lstat, readlink } = await import('fs/promises');
    const linkStat = await lstat(join(antigravityDir, 'brain'));
    expect(linkStat.isSymbolicLink()).toBe(true);
    expect(await readlink(join(antigravityDir, 'brain'))).toBe(join(sharedDir, 'brain'));
    expect(await readFile(join(sharedDir, 'brain', 'note.txt'), 'utf-8')).toBe('hello');
  });

  it('backs up a real file (does not delete it) when a shared target already exists, then symlinks it', async () => {
    // Shared target already has content, and a conflicting real file sits at the link path.
    await writeFile(join(sharedDir, 'keybindings.json'), 'shared content', 'utf-8');
    await writeFile(join(antigravityDir, 'keybindings.json'), 'conflicting real content', 'utf-8');

    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    await engine.repair();

    const { lstat, readlink } = await import('fs/promises');
    const linkStat = await lstat(join(antigravityDir, 'keybindings.json'));
    expect(linkStat.isSymbolicLink()).toBe(true);
    expect(await readlink(join(antigravityDir, 'keybindings.json'))).toBe(
      join(sharedDir, 'keybindings.json'),
    );
    // Shared target is untouched
    expect(await readFile(join(sharedDir, 'keybindings.json'), 'utf-8')).toBe('shared content');
    // The conflicting real file was preserved via backup, not deleted
    const entries = await readdir(antigravityDir);
    const backupName = entries.find(e => e.startsWith('keybindings.json.agyw-backup-'));
    expect(backupName).toBeDefined();
    expect(await readFile(join(antigravityDir, backupName!), 'utf-8')).toBe(
      'conflicting real content',
    );
  });

  it('is idempotent when resolving a conflict — running repair() twice does not error', async () => {
    await writeFile(join(antigravityDir, 'keybindings.json'), 'real content', 'utf-8');

    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    await engine.repair();
    await expect(engine.repair()).resolves.toBeUndefined();
  });
});

describe('SymlinkEngine.checkHealth()', () => {
  it('returns { ok: N, broken: 0 } for a fully healthy setup', async () => {
    const items = ['keybindings.json', 'brain/'];

    // Create shared targets
    await writeFile(join(sharedDir, 'keybindings.json'), '{}', 'utf-8');
    await mkdir(join(sharedDir, 'brain'), { recursive: true });

    const engine = new SymlinkEngine(antigravityDir, sharedDir, items);
    await engine.repair();

    const health = await engine.checkHealth();
    expect(health.ok).toBe(2);
    expect(health.broken).toBe(0);
  });

  it('counts broken symlinks correctly when the target is missing', async () => {
    const items = ['keybindings.json', 'brain/'];

    // Create the shared targets so repair() succeeds
    await writeFile(join(sharedDir, 'keybindings.json'), '{}', 'utf-8');
    await mkdir(join(sharedDir, 'brain'), { recursive: true });

    const engine = new SymlinkEngine(antigravityDir, sharedDir, items);
    await engine.repair();

    // Now remove the shared targets to simulate broken symlinks
    await rm(join(sharedDir, 'keybindings.json'));
    await rm(join(sharedDir, 'brain'), { recursive: true });

    const health = await engine.checkHealth();
    expect(health.ok).toBe(0);
    expect(health.broken).toBe(2);
  });

  it('counts a missing link path as broken', async () => {
    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['nonexistent.json']);
    const health = await engine.checkHealth();
    expect(health.ok).toBe(0);
    expect(health.broken).toBe(1);
  });

  it('counts a real file at link path as broken', async () => {
    await writeFile(join(antigravityDir, 'keybindings.json'), 'real', 'utf-8');
    const engine = new SymlinkEngine(antigravityDir, sharedDir, ['keybindings.json']);
    const health = await engine.checkHealth();
    expect(health.ok).toBe(0);
    expect(health.broken).toBe(1);
  });
});
