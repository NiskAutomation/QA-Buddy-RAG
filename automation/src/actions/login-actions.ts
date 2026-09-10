import { expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';

export class LoginActions {
  constructor(private readonly loginPage: LoginPage) {}

  async signIn(email: string, password: string): Promise<void> {
    await this.loginPage.open();
    await this.loginPage.submitCredentials(email, password);
  }

  async expectWelcome(displayName: string): Promise<void> {
    await expect(this.loginPage.status).toHaveText(`Welcome, ${displayName}`);
  }

  async expectInvalidCredentials(): Promise<void> {
    await expect(this.loginPage.alert).toHaveText('Invalid email or password');
  }
}
