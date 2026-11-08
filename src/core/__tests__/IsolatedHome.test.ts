import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, lstat, readlink, readFile, symlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { IsolatedHome } from '../IsolatedHome.js';

let root: string;
let agywDir: string;
let realHome: string;
let iso: IsolatedHome;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'agyw-iso-'));
  agywDir = join(root, '.agyw');
  realHome = join(root, 'home');
  await mkdir(join(realHome, '.gemini'), { recursive: true });
  await mkdir(join(realHome, 'Library', 'Keychains'), { recursive: true });
  await mkdir(join(realHome, '.ssh'), { recursive: true });
  await writeFile(join(realHome, '.gitconfig'), '[user]\n', 'utf-8');
  iso = new IsolatedHome(agywDir, realHome);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const isLink = (p: string) => lstat(p).then(s => s.isSymbolicLink());
const exists = (p: string) => lstat(p).then(() => true, () => false);

describe('IsolatedHome.prepare()', () => {
  it('creates the isolated agy dir under agywDir/homes/<name>', async () => {
    const home = await iso.prepare('work');
    expect(home).toBe(join(agywDir, 'homes', 'work'));
    expect((await lstat(join(home, '.gemini', 'antigravity-cli'))).isDirectory()).toBe(true);
  });

  it('passes dotfiles through as symlinks so child tools keep their config', async () => {
    const home = await iso.prepare('work');
    expect(await isLink(join(home, '.gitconfig'))).toBe(true);
    expect(await readlink(join(home, '.ssh'))).toBe(join(realHome, '.ssh'));
  });

  it('never passes Library through (keeps the keychain unreachable so agy uses file token storage)', async () => {
    const home = await iso.prepare('work');
    expect(await exists(join(home, 'Library'))).toBe(false);
  });

  it('never passes the real .gemini through (state stays per profile)', async () => {
    const home = await iso.prepare('work');
    expect(await isLink(join(home, '.gemini'))).toBe(false);
  });

  it('links config-like items to the shared dir and keeps conversations/cache private', async () => {
    const home = await iso.prepare('work');
    const agyDir = join(home, '.gemini', 'antigravity-cli');
    expect(await readlink(join(agyDir, 'skills'))).toBe(join(agywDir, 'shared', 'skills'));
    expect(await exists(join(agyDir, 'conversations'))).toBe(false);
    expect(await exists(join(agyDir, 'cache'))).toBe(false);
  });

  it('is idempotent and does not overwrite files agy wrote into the isolated home', async () => {
    const home = await iso.prepare('work');
    const token = join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
    await writeFile(token, 'tok', 'utf-8');
    await writeFile(join(home, '.gitconfig.local'), 'x', 'utf-8');

    await expect(iso.prepare('work')).resolves.toBe(home);
    expect(await exists(token)).toBe(true);
  });

  it('picks up dotfiles created in the real HOME after the first prepare', async () => {
    const home = await iso.prepare('work');
    await writeFile(join(realHome, '.npmrc'), 'x', 'utf-8');
    await iso.prepare('work');
    expect(await isLink(join(home, '.npmrc'))).toBe(true);
  });

  it.each(['../evil', 'a/b', '', '.hidden', 'x'.repeat(33), 'sp ace'])(
    'rejects invalid profile name %j',
    async name => {
      await expect(iso.prepare(name)).rejects.toMatchObject({ code: 'ERR_INVALID_HOME_NAME' });
    },
  );
});

describe('IsolatedHome.buildEnv()', () => {
  it('overrides HOME and records the real HOME, keeping the rest of the env', () => {
    const env = iso.buildEnv('work', { PATH: '/bin', HOME: '/real' });
    expect(env.HOME).toBe(join(agywDir, 'homes', 'work'));
    expect(env.AGYW_REAL_HOME).toBe(realHome);
    expect(env.AGYW_PROFILE).toBe('work');
    expect(env.PATH).toBe('/bin');
  });
});

describe('IsolatedHome.list()', () => {
  it('returns [] when no homes exist', async () => {
    expect(await iso.list()).toEqual([]);
  });

  it('reports which homes have a login token', async () => {
    const a = await iso.prepare('alpha');
    await iso.prepare('beta');
    await writeFile(join(a, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 't', 'utf-8');
    expect(await iso.list()).toEqual([
      { name: 'alpha', loggedIn: true },
      { name: 'beta', loggedIn: false },
    ]);
  });
});

describe('IsolatedHome.buildEnv() on non-macOS', () => {
  it('makes the session bus unreachable so a shared keyring cannot be used', () => {
    const env = iso.buildEnv('work', { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' }, 'linux');
    expect(env.DBUS_SESSION_BUS_ADDRESS).toContain('/nonexistent/');
  });

  it('leaves the D-Bus address alone on macOS', () => {
    const env = iso.buildEnv('work', { DBUS_SESSION_BUS_ADDRESS: 'x' }, 'darwin');
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('x');
  });
});

describe('IsolatedHome.remove()', () => {
  it('deletes the home but never the real files its symlinks point to', async () => {
    const home = await iso.prepare('work');
    await writeFile(join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 't', 'utf-8');

    await iso.remove('work');

    expect(await exists(home)).toBe(false);
    expect(await readFile(join(realHome, '.gitconfig'), 'utf-8')).toBe('[user]\n');
    expect(await exists(join(realHome, '.ssh'))).toBe(true);
  });

  it('throws ERR_HOME_NOT_FOUND for an unknown profile', async () => {
    await expect(iso.remove('ghost')).rejects.toMatchObject({ code: 'ERR_HOME_NOT_FOUND' });
  });

  it('rejects a path-traversal name before touching the disk', async () => {
    await expect(iso.remove('../home')).rejects.toMatchObject({ code: 'ERR_INVALID_HOME_NAME' });
    expect(await exists(realHome)).toBe(true);
  });
});

describe('IsolatedHome.diagnose() / repair()', () => {
  it('reports a healthy home as no issues', async () => {
    await iso.prepare('work');
    expect(await iso.diagnose('work')).toEqual([]);
  });

  it('flags a Library that would give agy back the global keychain', async () => {
    const home = await iso.prepare('work');
    await symlink(join(realHome, 'Library'), join(home, 'Library'));
    expect((await iso.diagnose('work')).join('\n')).toContain('Library');
  });

  it('repair() drops a Library symlink but never a real Library directory', async () => {
    const home = await iso.prepare('work');
    await symlink(join(realHome, 'Library'), join(home, 'Library'));
    await iso.repair('work');
    expect(await exists(join(home, 'Library'))).toBe(false);
    expect(await exists(join(realHome, 'Library', 'Keychains'))).toBe(true);

    await mkdir(join(home, 'Library'), { recursive: true });
    await iso.repair('work');
    expect(await exists(join(home, 'Library'))).toBe(true);
  });

  it('flags .gemini that is a symlink to the real one', async () => {
    const home = await iso.prepare('work');
    await rm(join(home, '.gemini'), { recursive: true, force: true });
    await symlink(join(realHome, '.gemini'), join(home, '.gemini'));
    expect((await iso.diagnose('work')).join('\n')).toContain('.gemini is a symlink');
  });

  it('flags a shared item replaced by a real directory', async () => {
    const home = await iso.prepare('work');
    const skills = join(home, '.gemini', 'antigravity-cli', 'skills');
    await rm(skills, { force: true });
    await mkdir(skills);
    expect((await iso.diagnose('work')).join('\n')).toContain('shared link');
  });
});
