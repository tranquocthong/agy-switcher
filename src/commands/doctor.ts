import { access, lstat, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { ConfigStore } from '../core/ConfigStore.js';
import { ANTIGRAVITY_DIR, SHARED_ITEMS } from '../core/factory.js';
import { handleError } from '../utils/cli-helpers.js';

export async function doctorCommand(): Promise<void> {
  try {
    const agywDir = join(homedir(), '.agyw');
    const configStore = new ConfigStore(agywDir);
    const config = await configStore.readConfig();

    let hasIssue = false;

    // Check shared items in antigravityDir are symlinks
    for (const item of SHARED_ITEMS) {
      const normalized = item.endsWith('/') ? item.slice(0, -1) : item;
      const linkPath = join(ANTIGRAVITY_DIR, normalized);
      try {
        const st = await lstat(linkPath);
        if (!st.isSymbolicLink()) {
          process.stderr.write(`ERROR: ${linkPath} is a real file, expected symlink\n`);
          hasIssue = true;
        } else {
          process.stdout.write(`OK: symlink ${normalized}\n`);
        }
      } catch {
        process.stderr.write(`ERROR: missing ${linkPath}\n`);
        hasIssue = true;
      }
    }

    // Check per-profile private files
    for (const [name, profile] of Object.entries(config.profiles)) {
      try {
        await access(profile.path);
        const entries = await readdir(profile.path);
        process.stdout.write(`OK: profile ${name} (${entries.length} files)\n`);
      } catch {
        process.stderr.write(`ERROR: profile '${name}' directory missing: ${profile.path}\n`);
        hasIssue = true;
      }
    }

    if (hasIssue) process.exit(1);
  } catch (err) {
    handleError(err);
  }
}
