import { describe, it, expect } from 'vitest';
import { NoOpCredentialStore } from '../NoOpCredentialStore.js';

describe('NoOpCredentialStore', () => {
  it('save resolves without throwing', async () => {
    const store = new NoOpCredentialStore();
    await expect(store.save('default')).resolves.toBeUndefined();
  });

  it('load resolves without throwing', async () => {
    const store = new NoOpCredentialStore();
    await expect(store.load('default')).resolves.toBeUndefined();
  });
});
