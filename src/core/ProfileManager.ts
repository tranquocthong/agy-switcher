import { access, mkdir, cp, rm, rename, lstat } from 'fs/promises';
import { join } from 'path';
import type { ConfigStore } from './ConfigStore.js';
import type { FileSwapper } from './FileSwapper.js';
import type { SymlinkEngine } from './SymlinkEngine.js';
import type { LockManager } from './LockManager.js';
import type { HistoryTracker } from './HistoryTracker.js';
import { AgywError } from '../utils/errors.js';

const CREDENTIAL_FILES = ['installation_id', 'user_settings.pb'];

export class ProfileManager {
  constructor(
    private configStore: ConfigStore,
    private fileSwapper: FileSwapper,
    private symlinkEngine: SymlinkEngine,
    private lockManager: LockManager,
    private historyTracker: HistoryTracker,
  ) {}

  private get profilesDir(): string {
    return join(this.configStore.agywDir, 'profiles');
  }

  // FR-004
  async switch(name: string): Promise<void> {
    await this.lockManager.acquire();
    try {
      const resolved = await this.resolveProfile(name);
      const active = await this.configStore.getActive();
      if (resolved === active.profile) return;

      await this.fileSwapper.save(active.profile);
      await this.fileSwapper.load(resolved);
      await this.symlinkEngine.repair();
      await this.configStore.setActive(resolved);
      await this.historyTracker.record(process.cwd(), resolved);
    } finally {
      await this.lockManager.release();
    }
  }

  async resolveProfile(name: string): Promise<string> {
    const config = await this.configStore.readConfig();
    const names = Object.keys(config.profiles);

    if (names.includes(name)) return name;

    const matches = names.filter(p => p.startsWith(name));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new AgywError('ERR_AMBIGUOUS_PROFILE', { name, matches: matches.join(', ') });
    }
    throw new AgywError('ERR_PROFILE_NOT_FOUND', { name });
  }

  // FR-001
  async init(antigravityDir: string): Promise<void> {
    if (await this.configStore.configExists()) return;

    try {
      await access(antigravityDir);
    } catch {
      throw new AgywError('ERR_ANTIGRAVITY_NOT_INIT');
    }

    const sharedDir = this.symlinkEngine.sharedDir;
    const sharedItems = this.symlinkEngine.sharedItems;

    await mkdir(this.profilesDir, { recursive: true });
    await mkdir(sharedDir, { recursive: true });

    // Move real shared items from antigravityDir → sharedDir before repair
    for (const item of sharedItems) {
      const normalized = item.endsWith('/') ? item.slice(0, -1) : item;
      const src = join(antigravityDir, normalized);
      const dest = join(sharedDir, normalized);
      try {
        const st = await lstat(src);
        if (!st.isSymbolicLink()) {
          try {
            await rename(src, dest);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
              await cp(src, dest, { recursive: true });
              await rm(src, { recursive: true, force: true });
            } else {
              throw err;
            }
          }
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }

    await this.fileSwapper.save('default');
    await this.symlinkEngine.repair();

    await this.configStore.writeConfig({
      version: 1,
      antigravity_dir: antigravityDir,
      shared_source: sharedDir,
      profiles: {
        default: {
          path: join(this.profilesDir, 'default'),
          model: 'gemini-pro',
          created_at: new Date().toISOString(),
        },
      },
      private: sharedItems.map(i => (i.endsWith('/') ? i.slice(0, -1) : i)),
      shared: sharedItems,
    });
    await this.configStore.setActive('default');
  }

  // FR-002
  async addProfile(name: string, cloneFrom?: string): Promise<void> {
    const config = await this.configStore.readConfig();

    if (config.profiles[name]) {
      throw new AgywError('ERR_PROFILE_EXISTS', { name });
    }

    const active = await this.configStore.getActive();
    const source = cloneFrom ?? active.profile;

    const sourceEntry = config.profiles[source];
    if (!sourceEntry) {
      throw new AgywError('ERR_PROFILE_NOT_FOUND', { name: source });
    }

    const srcDir = join(this.profilesDir, source);
    const destDir = join(this.profilesDir, name);

    await cp(srcDir, destDir, { recursive: true });

    for (const cred of CREDENTIAL_FILES) {
      await rm(join(destDir, cred), { force: true });
    }

    config.profiles[name] = {
      path: destDir,
      model: sourceEntry.model,
      created_at: new Date().toISOString(),
    };
    await this.configStore.writeConfig(config);
  }

  // FR-006
  async removeProfile(name: string): Promise<void> {
    const config = await this.configStore.readConfig();

    if (!config.profiles[name]) {
      throw new AgywError('ERR_PROFILE_NOT_FOUND', { name });
    }

    const active = await this.configStore.getActive();
    if (name === active.profile) {
      throw new AgywError('ERR_REMOVE_ACTIVE');
    }

    const nonActiveProfiles = Object.keys(config.profiles).filter(p => p !== active.profile);
    if (nonActiveProfiles.length <= 1) {
      throw new AgywError('ERR_REMOVE_LAST');
    }

    await rm(join(this.profilesDir, name), { recursive: true, force: true });

    delete config.profiles[name];
    await this.configStore.writeConfig(config);
  }
}
