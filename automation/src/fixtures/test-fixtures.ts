import { test as base, expect } from '@playwright/test';
import users from '../data/users.json';
import { TestDataClient } from '../api/test-data-client';

type UserData = typeof users;

type QAFixtures = {
  apiClient: TestDataClient;
  userData: UserData;
};

export const test = base.extend<QAFixtures>({
  apiClient: async ({ request }, use) => {
    const client = new TestDataClient(request);
    await use(client);
  },
  userData: async ({}, use) => {
    await use(structuredClone(users));
  },
  storageState: async ({}, use) => {
    // Override with a persisted auth-state path for suites that begin authenticated.
    await use({ cookies: [], origins: [] });
  },
});

export { expect };
