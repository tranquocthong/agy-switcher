import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, chmod } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const SERVICE = 'gemini';
const ACCOUNT = 'antigravity';
const TOKEN_FILE = 'keychain.token';

export class KeychainManager {
  constructor(private profilesDir: string) {}

  async save(profileName: string): Promise<void> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w',
      ]);
      const token = stdout.trim();
      if (!token) return;
      const dest = join(this.profilesDir, profileName, TOKEN_FILE);
      await writeFile(dest, token, 'utf-8');
      await chmod(dest, 0o600);
    } catch {
      // No keychain entry — nothing to save
    }
  }

  async load(profileName: string): Promise<void> {
    let token: string | null = null;
    try {
      token = (await readFile(join(this.profilesDir, profileName, TOKEN_FILE), 'utf-8')).trim();
    } catch {
      // No saved token for this profile
    }

    if (token) {
      await execFileAsync('security', [
        'add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', token,
      ]);
    } else {
      try {
        await execFileAsync('security', [
          'delete-generic-password', '-s', SERVICE, '-a', ACCOUNT,
        ]);
      } catch {
        // No entry to delete — fine
      }
    }
  }
}
