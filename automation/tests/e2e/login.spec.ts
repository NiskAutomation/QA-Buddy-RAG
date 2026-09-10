import { LoginActions } from '../../src/actions/login-actions';
import { LoginPage } from '../../src/pages/login-page';
import { test } from '../../src/fixtures/test-fixtures';

test('@smoke @REQ-AUTH-001 active customer signs in', async ({ page, userData }) => {
  const actions = new LoginActions(new LoginPage(page));
  const customer = userData.activeCustomer;

  await actions.signIn(customer.email, customer.password);
  await actions.expectWelcome(customer.displayName);
});

test('@regression @REQ-AUTH-002 invalid credentials are rejected', async ({ page, userData }) => {
  const actions = new LoginActions(new LoginPage(page));
  const customer = userData.invalidCustomer;

  await actions.signIn(customer.email, customer.password);
  await actions.expectInvalidCredentials();
});
