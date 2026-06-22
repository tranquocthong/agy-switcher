export interface Profile {
  path: string;
  model: string;
  created_at: string;
}

export interface ConfigYaml {
  version: 1;
  antigravity_dir: string;
  shared_source: string;
  profiles: Record<string, Profile>;
  private: string[];
  shared: string[];
}

export interface ActiveProfile {
  version: 1;
  profile: string;
  switched_at: string;
}

export interface HistoryEntry {
  dir: string;
  profile: string;
  timestamp: string;
}

export type HistoryYaml = HistoryEntry[];
