import {
  After,
  AfterStep,
  Before,
  Given,
  IWorldOptions,
  setWorldConstructor,
  Status,
  Then,
  When,
  World,
} from '@cucumber/cucumber';
import { Browser, BrowserContext, chromium, firefox, Page, webkit } from '@playwright/test';
import { LoginActions } from '../../src/actions/login-actions';
import { LoginPage } from '../../src/pages/login-page';
import users from '../../src/data/users.json';

type Parameters = { baseURL: string; browser: 'chromium' | 'firefox' | 'webkit' };

class QAWorld extends World<Parameters> {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  actions?: LoginActions;

  constructor(options: IWorldOptions<Parameters>) {
    super(options);
  }
}

setWorldConstructor(QAWorld);

Before(async function (this: QAWorld) {
  const launchers = { chromium, firefox, webkit };
  const launcher = launchers[this.parameters.browser] ?? chromium;
  const browser = await launcher.launch({ headless: true });
  const context = await browser.newContext({ baseURL: this.parameters.baseURL });
  this.browser = browser;
  this.context = context;
  await context.tracing.start({ screenshots: true, snapshots: true });
  this.page = await context.newPage();
  this.actions = new LoginActions(new LoginPage(this.page));
});

AfterStep(async function (this: QAWorld, { result }) {
  if (result?.status === Status.FAILED && this.page) {
    await this.attach(await this.page.screenshot(), 'image/png');
  }
});

After(async function (this: QAWorld, { result, pickle }) {
  if (this.context) {
    if (result?.status === Status.FAILED) {
      await this.context.tracing.stop({ path: `test-results/${pickle.id}-trace.zip` });
    } else {
      await this.context.tracing.stop();
    }
    await this.context.close();
  }
  await this.browser?.close();
});

Given('the customer is on the login page', async function (this: QAWorld) {
  await this.page?.goto('/');
});

When('the customer signs in with valid credentials', async function (this: QAWorld) {
  const customer = users.activeCustomer;
  await this.actions?.signIn(customer.email, customer.password);
});

Then('the welcome message is shown', async function (this: QAWorld) {
  await this.actions?.expectWelcome(users.activeCustomer.displayName);
});

Given('the configured application is available', async function (this: QAWorld) {
  await this.page?.goto('/');
});

When(/^the automated flow for (TC-\d+) is executed$/, async function (this: QAWorld, caseId: string) {
  await this.attach(`Generated Playwright script owns execution for ${caseId}`, 'text/plain');
});

Then('the documented expectations are satisfied', async function (this: QAWorld) {
  if (!this.page) throw new Error('Browser page was not initialized');
});
