import { homedir } from 'os';
import { join } from 'path';
import { ConfigStore } from './ConfigStore.js';
import { FileSwapper } from './FileSwapper.js';
import { SymlinkEngine } from './SymlinkEngine.js';
import { LockManager } from './LockManager.js';
import { HistoryTracker } from './HistoryTracker.js';
import { ProfileManager } from './ProfileManager.js';

const PRIVATE_ITEMS = [
  'installation_id',
  'user_settings.pb',
  'mcp_config.json',
  'settings.json',
  'settings.local.json',
  'cli.log',
  'updater',
  'antigravity_state.pbtxt',
];

const SHARED_ITEMS = [
  'conversations/',
  'brain/',
  'implicit/',
  'knowledge/',
  'skills/',
  'hooks/',
  'cache/',
  'builtin/',
  'keybindings.json',
];

const ANTIGRAVITY_DIR = join(homedir(), '.gemini', 'antigravity-cli');

export function createProfileManager(agywDir = join(homedir(), '.agyw')): ProfileManager {
  const profilesDir = join(agywDir, 'profiles');
  const sharedDir = join(agywDir, 'shared');

  const configStore = new ConfigStore(agywDir);
  const fileSwapper = new FileSwapper(ANTIGRAVITY_DIR, profilesDir, PRIVATE_ITEMS);
  const symlinkEngine = new SymlinkEngine(ANTIGRAVITY_DIR, sharedDir, SHARED_ITEMS);
  const lockManager = new LockManager(agywDir);
  const historyTracker = new HistoryTracker(configStore);

  return new ProfileManager(configStore, fileSwapper, symlinkEngine, lockManager, historyTracker);
}

export { ANTIGRAVITY_DIR, PRIVATE_ITEMS, SHARED_ITEMS };
