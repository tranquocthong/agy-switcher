import type { CredentialStore } from './CredentialStore.js';

/**
 * Linux credential store — no-op.
 *
 * On Linux, `agy` stores its OAuth token in `antigravity-oauth-token` (a plain
 * file), which FileSwapper already copies per-profile. No additional system
 * keyring interaction is needed here.
 *
 * Users must run `agy` with GEMINI_FORCE_FILE_STORAGE=true so that `agy`
 * writes tokens to the file instead of attempting libsecret/GNOME Keyring
 * (which fails in headless and Docker environments).
 */
export class NoOpCredentialStore implements CredentialStore {
  async save(_profileName: string): Promise<void> {}
  async load(_profileName: string): Promise<void> {}
}
