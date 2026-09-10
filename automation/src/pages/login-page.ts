import { expect, Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly alert: Locator;
  readonly status: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.alert = page.getByRole('alert');
    this.status = page.getByRole('status');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.submit).toBeVisible();
  }

  async submitCredentials(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
