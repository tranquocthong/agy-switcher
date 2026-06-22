import { symlink, unlink, lstat, readlink, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { AgywError } from '../utils/errors.js';

export class SymlinkEngine {
  constructor(
    private antigravityDir: string,
    readonly sharedDir: string,
    readonly sharedItems: string[],
  ) {}

  // Create or repair symlinks for all sharedItems.
  // antigravityDir/item → sharedDir/item (absolute path target)
  async repair(): Promise<void> {
    for (const item of this.sharedItems) {
      const normalizedItem = item.endsWith('/') ? item.slice(0, -1) : item;
      const linkPath = join(this.antigravityDir, normalizedItem);
      const targetPath = join(this.sharedDir, normalizedItem);

      // Ensure target directory exists when item represents a directory
      if (item.endsWith('/')) {
        await mkdir(targetPath, { recursive: true });
      }

      try {
        const st = await lstat(linkPath);
        if (st.isSymbolicLink()) {
          const current = await readlink(linkPath);
          if (current !== targetPath) {
            await unlink(linkPath);
            await symlink(targetPath, linkPath);
          }
          // else already correct, nothing to do
        } else {
          // Real file or dir — conflict
          throw new AgywError('ERR_SYMLINK_CONFLICT', { item: normalizedItem });
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // linkPath doesn't exist — create symlink
          await symlink(targetPath, linkPath);
        } else {
          throw err;
        }
      }
    }
  }

  async checkHealth(): Promise<{ ok: number; broken: number }> {
    let ok = 0;
    let broken = 0;
    for (const item of this.sharedItems) {
      const normalizedItem = item.endsWith('/') ? item.slice(0, -1) : item;
      const linkPath = join(this.antigravityDir, normalizedItem);
      try {
        const st = await lstat(linkPath);
        if (st.isSymbolicLink()) {
          // Check if target is reachable
          const target = await readlink(linkPath);
          try {
            await access(target);
            ok++;
          } catch {
            broken++;
          }
        } else {
          broken++; // real file where symlink expected
        }
      } catch {
        broken++; // doesn't exist
      }
    }
    return { ok, broken };
  }
}
