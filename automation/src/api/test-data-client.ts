import { APIRequestContext } from '@playwright/test';

export class TestDataClient {
  constructor(private readonly request: APIRequestContext) {}

  async seedCustomer(payload: Record<string, unknown>): Promise<void> {
    const endpoint = process.env.TEST_DATA_SEED_ENDPOINT;
    if (!endpoint) return;
    const response = await this.request.post(endpoint, { data: payload });
    if (!response.ok()) throw new Error(`Test-data seed failed: ${response.status()}`);
  }

  async teardownCustomer(id: string): Promise<void> {
    const endpoint = process.env.TEST_DATA_SEED_ENDPOINT;
    if (!endpoint) return;
    const response = await this.request.delete(`${endpoint}/${encodeURIComponent(id)}`);
    if (!response.ok()) throw new Error(`Test-data teardown failed: ${response.status()}`);
  }
}
