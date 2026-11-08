import { symlink, unlink, lstat, readlink, access, mkdir, rename, cp, rm } from 'fs/promises';
import { join } from 'path';

export class SymlinkEngine {
  constructor(
    private antigravityDir: string,
    readonly sharedDir: string,
    readonly sharedItems: string[],
    readonly releasedItems: string[] = [],
  ) {}

  // Turn a leftover agyw-managed symlink for a no-longer-shared item back into
  // a real copy, so agy owns it again. Real files/dirs and foreign symlinks are
  // left untouched (never delete user data).
  async release(): Promise<void> {
    for (const item of this.releasedItems) {
      const normalized = item.endsWith('/') ? item.slice(0, -1) : item;
      const linkPath = join(this.antigravityDir, normalized);

      let target: string;
      try {
        const st = await lstat(linkPath);
        if (!st.isSymbolicLink()) continue;
        target = await readlink(linkPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }

      // Only touch symlinks that point into the agyw shared dir.
      if (target !== join(this.sharedDir, normalized)) continue;

      const tmpPath = `${linkPath}.agyw-release-${Date.now()}`;
      try {
        await cp(target, tmpPath, { recursive: true });
      } catch (err) {
        // Dangling symlink: nothing to preserve, just drop it.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        await unlink(linkPath);
        continue;
      }
      await unlink(linkPath);
      await rename(tmpPath, linkPath);
    }
  }

  // Create or repair symlinks for all sharedItems.
  // antigravityDir/item → sharedDir/item (absolute path target)
  async repair(): Promise<void> {
    await this.release();
    for (const item of this.sharedItems) {
      const isDir = item.endsWith('/');
      const normalizedItem = isDir ? item.slice(0, -1) : item;
      const linkPath = join(this.antigravityDir, normalizedItem);
      const targetPath = join(this.sharedDir, normalizedItem);

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
          // Real file/dir where a symlink is expected — self-heal (SD §10.5)
          // instead of erroring, so switch/doctor --fix never gets stuck.
          await this.resolveConflict(linkPath, targetPath);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // linkPath doesn't exist — create the shared target dir first (if
          // this item is a directory) so the fresh symlink resolves cleanly.
          if (isDir) await mkdir(targetPath, { recursive: true });
          await symlink(targetPath, linkPath);
        } else {
          throw err;
        }
      }
    }
  }

  // A real file/dir sits where a symlink belongs. Adopt it as the shared
  // target if none exists yet; otherwise back it up (never delete — NFR-002)
  // so the conflicting data is preserved for manual inspection.
  private async resolveConflict(linkPath: string, targetPath: string): Promise<void> {
    const targetExists = await access(targetPath).then(
      () => true,
      () => false,
    );
    if (targetExists) {
      const backupPath = `${linkPath}.agyw-backup-${Date.now()}`;
      await rename(linkPath, backupPath);
      process.stderr.write(
        `WARN: ${linkPath} conflicted with existing shared data; backed up to ${backupPath}\n`,
      );
    } else {
      await this.moveInto(linkPath, targetPath);
    }
    await symlink(targetPath, linkPath);
  }

  private async moveInto(src: string, dest: string): Promise<void> {
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
