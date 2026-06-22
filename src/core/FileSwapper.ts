import { copyFile, mkdir, readdir, stat } from 'fs/promises';
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
      await this.copyItem(src, dest);
    }
  }

  async load(profileName: string): Promise<void> {
    for (const item of this.privateItems) {
      const src = join(this.profilesDir, profileName, item);
      const dest = join(this.antigravityDir, item);
      await this.copyItem(src, dest);
    }
  }

  private async copyItem(src: string, dest: string): Promise<void> {
    let srcStat;
    try {
      srcStat = await stat(src);
    } catch {
      // Source doesn't exist — silently skip
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
