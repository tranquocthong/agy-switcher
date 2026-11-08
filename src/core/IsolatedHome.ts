import { mkdir, readdir, lstat, symlink, rm, unlink } from 'fs/promises';
import { join } from 'path';
import { SymlinkEngine } from './SymlinkEngine.js';
import { AgywError } from '../utils/errors.js';

export const HOME_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

// Only configuration-like items are shared across isolated homes. Conversations,
// cache and implicit context are account-bound (cache holds per-account project
// ids), so each isolated home keeps its own.
export const ISOLATED_SHARED_ITEMS = ['skills/', 'hooks/', 'knowledge/'];

// Never pass these through from the real HOME:
// - .gemini: each isolated home owns its own agy state.
// - Library: its absence is what makes the macOS keychain unreachable, so agy
//   falls back to file token storage inside the isolated home. Passing it
//   through would silently re-couple every profile to the one global keychain slot.
// - .agyw: avoids a symlink loop into the isolated homes themselves.
const PASSTHROUGH_EXCLUDE = new Set(['.gemini', 'Library', '.agyw', '.Trash', '.DS_Store']);

/**
 * aimux-style isolation: agy runs with HOME pointed at a per-profile directory,
 * so credentials and state live there instead of being swapped into the shared
 * ~/.gemini and global keychain slot. Several accounts can run side by side.
 */
export class IsolatedHome {
  constructor(
    private agywDir: string,
    private realHome: string,
    private sharedItems: string[] = ISOLATED_SHARED_ITEMS,
  ) {}

  homeDir(name: string): string {
    return join(this.agywDir, 'homes', name);
  }

  assertValidName(name: string): void {
    if (!HOME_NAME_RE.test(name)) {
      throw new AgywError('ERR_INVALID_HOME_NAME', { name });
    }
  }

  // Create the isolated home (idempotent) and return its path.
  async prepare(name: string): Promise<string> {
    this.assertValidName(name);
    const home = this.homeDir(name);
    const agyDir = join(home, '.gemini', 'antigravity-cli');
    await mkdir(agyDir, { recursive: true });

    await new SymlinkEngine(agyDir, join(this.agywDir, 'shared'), this.sharedItems).repair();
    await this.passthrough(home);
    return home;
  }

  // Symlink the user's dotfiles into the isolated HOME so child tools (git, ssh,
  // gh, node, claude...) still find their config. Existing entries are never touched.
  private async passthrough(home: string): Promise<void> {
    for (const entry of await readdir(this.realHome)) {
      if (PASSTHROUGH_EXCLUDE.has(entry)) continue;
      const dest = join(home, entry);
      try {
        await lstat(dest);
        continue; // already present (symlink or real)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      try {
        await symlink(join(this.realHome, entry), dest);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      }
    }
  }

  buildEnv(
    name: string,
    base: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...base,
      HOME: this.homeDir(name),
      AGYW_REAL_HOME: this.realHome,
      AGYW_PROFILE: name,
    };
    if (platform !== 'darwin') {
      // Best effort, NOT verified on Linux: on a desktop session libsecret would
      // reach the one shared keyring regardless of HOME and re-couple every
      // profile. Making the session bus unreachable pushes agy to its documented
      // "keyring failed, falling back to file storage" path instead.
      env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/nonexistent/agyw-no-keyring';
    }
    return env;
  }

  async exists(name: string): Promise<boolean> {
    this.assertValidName(name);
    return lstat(this.homeDir(name)).then(s => s.isDirectory(), () => false);
  }

  // Delete an isolated home (login token, history, state). Symlinks inside it
  // (dotfile passthrough, shared items) are removed as links, never followed.
  async remove(name: string): Promise<void> {
    if (!(await this.exists(name))) {
      throw new AgywError('ERR_HOME_NOT_FOUND', { name });
    }
    await rm(this.homeDir(name), { recursive: true, force: true });
  }

  // Health report for one isolated home. Empty array = healthy.
  async diagnose(name: string): Promise<string[]> {
    const home = this.homeDir(name);
    const issues: string[] = [];

    // Library inside the isolated HOME would give agy back the one global
    // keychain slot and silently re-couple every profile.
    if (await lstat(join(home, 'Library')).then(() => true, () => false)) {
      issues.push('Library exists in the isolated HOME (agy may use the global keychain)');
    }

    const gem = await lstat(join(home, '.gemini')).catch(() => null);
    if (!gem) issues.push('.gemini is missing');
    else if (gem.isSymbolicLink()) issues.push('.gemini is a symlink to the real one (state is not isolated)');

    const health = await new SymlinkEngine(
      join(home, '.gemini', 'antigravity-cli'),
      join(this.agywDir, 'shared'),
      this.sharedItems,
    ).checkHealth();
    if (health.broken > 0) issues.push(`${health.broken} shared link(s) broken or replaced by real files`);
    return issues;
  }

  // Repair what diagnose() reports: re-create shared links and passthrough, and
  // drop a Library *symlink* (a real Library directory is never deleted).
  async repair(name: string): Promise<void> {
    const lib = join(this.homeDir(name), 'Library');
    const st = await lstat(lib).catch(() => null);
    if (st?.isSymbolicLink()) await unlink(lib);
    await this.prepare(name);
  }

  // Names of existing isolated homes, with whether a login token is present.
  async list(): Promise<{ name: string; loggedIn: boolean }[]> {
    let names: string[];
    try {
      names = await readdir(join(this.agywDir, 'homes'));
    } catch {
      return [];
    }
    const out: { name: string; loggedIn: boolean }[] = [];
    for (const name of names.sort()) {
      if (!HOME_NAME_RE.test(name)) continue;
      const token = join(this.homeDir(name), '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
      const loggedIn = await lstat(token).then(() => true, () => false);
      out.push({ name, loggedIn });
    }
    return out;
  }
}
