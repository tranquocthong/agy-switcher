export interface CredentialStore {
  /** Snapshot the active credential from the system store into the profile dir. */
  save(profileName: string): Promise<void>;
  /** Restore the credential from the profile dir into the system store. */
  load(profileName: string): Promise<void>;
}
