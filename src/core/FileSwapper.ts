import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises';
import { dirname, join } from 'path';

export class FileSwapper {
  constructor(
    private antigravityDir: string,
    private profilesDir: string,
    private privateItems: string[],
  ) {}

  async save(profileName: string): Promise<void> {
    for (const item of this.privateItems) {
      const src = join(this.antigravityDir, item);
      const dest = join(this.profilesDir, profileName, item);
      await this.copyIfExists(src, dest);
    }
  }

  async load(profileName: string): Promise<void> {
    for (const item of this.privateItems) {
      const src = join(this.profilesDir, profileName, item);
      const dest = join(this.antigravityDir, item);
      await this.loadItem(src, dest);
    }
  }

  private async copyIfExists(src: string, dest: string): Promise<void> {
    let srcStat;
    try {
      srcStat = await stat(src);
    } catch {
      return;
    }

    if (srcStat.isDirectory()) {
      await this.copyDir(src, dest);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    }
  }

  private async loadItem(src: string, dest: string): Promise<void> {
    let srcStat;
    try {
      srcStat = await stat(src);
    } catch {
      // Profile doesn't have this item — clear it from antigravity dir so the new profile starts clean
      await rm(dest, { force: true, recursive: true });
      return;
    }

    if (srcStat.isDirectory()) {
      await this.copyDir(src, dest);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    }
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }
}
