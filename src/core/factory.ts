import { homedir } from 'os';
import { join } from 'path';
import { ConfigStore } from './ConfigStore.js';
import { FileSwapper } from './FileSwapper.js';
import { SymlinkEngine } from './SymlinkEngine.js';
import { LockManager } from './LockManager.js';
import { HistoryTracker } from './HistoryTracker.js';
import { MacOSKeychainStore } from './KeychainManager.js';
import { NoOpCredentialStore } from './NoOpCredentialStore.js';
import { ProcessGuard } from './ProcessGuard.js';
import { ProfileManager } from './ProfileManager.js';
import type { CredentialStore } from './CredentialStore.js';

const PRIVATE_ITEMS = [
  'installation_id',
  'user_settings.pb',
  'mcp_config.json',
  'settings.json',
  'settings.local.json',
  'cli.log',
  'updater',
  'antigravity_state.pbtxt',
  'antigravity-oauth-token',
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
  const credentialStore: CredentialStore =
    process.platform === 'darwin'
      ? new MacOSKeychainStore(profilesDir)
      : new NoOpCredentialStore();
  const processGuard = new ProcessGuard();

  return new ProfileManager(configStore, fileSwapper, symlinkEngine, lockManager, historyTracker, credentialStore, processGuard);
}

export { ANTIGRAVITY_DIR, PRIVATE_ITEMS, SHARED_ITEMS };
