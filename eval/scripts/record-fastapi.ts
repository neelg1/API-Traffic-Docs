// Drives eval app 1 (Full Stack FastAPI Template) in Chromium and records every
// request and response to a HAR file. Start the app first: pnpm eval:fastapi up
// Selectors and success messages follow the template's own Playwright tests.
// Never print HAR contents or response bodies here (CLAUDE.md rule 5).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';

const BASE_URL = 'http://localhost:8000';
// The app sends email to Mailcatcher; its API is read from Node, so it isn't recorded.
const MAILCATCHER_URL = 'http://localhost:1080';
const HAR_PATH = fileURLToPath(new URL('../recordings/fastapi-template.har', import.meta.url));

// The synthetic admin login lives in eval.env; read it rather than duplicate it.
process.loadEnvFile(fileURLToPath(new URL('../targets/fastapi-template/eval.env', import.meta.url)));
const ADMIN_EMAIL = requireEnv('FIRST_SUPERUSER');
const ADMIN_PASSWORD = requireEnv('FIRST_SUPERUSER_PASSWORD');

// Makes emails unique per run, so the script also works without a fresh database.
const RUN_ID = Date.now().toString(36);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from eval.env`);
  return value;
}

async function assertAppIsUp(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/utils/health-check/`).catch(() => null);
  if (!response?.ok) {
    throw new Error(`App not reachable at ${BASE_URL}. Start it with: pnpm eval:fastapi up`);
  }
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.getByText('Welcome back, nice to see you again!').waitFor();
}

async function logOut(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL(/\/login$/);
}

// Clicks and waits for the API response it triggers. Steadier than waiting for
// success toasts, which can vanish while the app navigates.
async function clickAndWaitForApi(page: Page, button: Locator, method: string, path: string) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === method &&
      decodeURIComponent(new URL(r.url()).pathname) === `/api/v1${path}`,
  );
  await button.click();
  return response;
}

// Returns the reset-password link (path and query) from the newest email to `email`.
async function resetLinkFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const messages = await fetch(`${MAILCATCHER_URL}/messages`)
      .then((r) => r.json() as Promise<{ id: number; recipients: string[] }[]>)
      .catch(() => {
        throw new Error(`Mailcatcher not reachable at ${MAILCATCHER_URL}; restart the app`);
      });
    const message = messages.filter((m) => m.recipients.some((r) => r.includes(email))).at(-1);
    if (message) {
      const html = await fetch(`${MAILCATCHER_URL}/messages/${message.id}.html`).then((r) => r.text());
      const href = /href="([^"]*\/reset-password\?token=[^"]+)"/.exec(html)?.[1];
      if (href) {
        const url = new URL(href);
        return `${url.pathname}${url.search}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No password-reset email for ${email} in Mailcatcher`);
}

function row(page: Page, text: string) {
  return page.getByRole('row').filter({ hasText: text });
}

// Items: list, create three (one without a description), edit one, delete one.
async function exerciseItems(page: Page): Promise<void> {
  await page.goto('/items');
  await page.getByRole('heading', { name: 'Items' }).waitFor();
  const titles = [`Eval item A ${RUN_ID}`, `Eval item B ${RUN_ID}`, `Eval item C ${RUN_ID}`];
  for (const [i, title] of titles.entries()) {
    await page.getByRole('button', { name: 'Add Item' }).click();
    await page.getByLabel('Title').fill(title);
    if (i !== 1) await page.getByLabel('Description').fill(`Description of ${title}`);
    await page.getByRole('button', { name: 'Save' }).click();
    await row(page, title).waitFor();
  }

  const [first, , third] = titles as [string, string, string];
  await row(page, first).getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Edit Item' }).click();
  await page.getByLabel('Title').fill(`${first} (edited)`);
  await page.getByRole('button', { name: 'Save' }).click();
  await row(page, `${first} (edited)`).waitFor();

  await row(page, third).getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Delete Item' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await row(page, third).waitFor({ state: 'hidden' });
}

// Admin: list users, create one, edit their name, delete them.
async function exerciseAdminUsers(page: Page): Promise<void> {
  const email = `eval-user-${RUN_ID}@example.com`;
  await page.goto('/admin');
  await page.getByRole('heading', { name: 'Users' }).waitFor();
  await page.getByRole('button', { name: 'Add User' }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Full name').fill('Eval User');
  await page.getByPlaceholder('Password').first().fill('eval-only-user-pass');
  await page.getByPlaceholder('Password').last().fill('eval-only-user-pass');
  await page.getByRole('button', { name: 'Save' }).click();
  await row(page, email).waitFor();

  await row(page, email).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Edit User' }).click();
  await page.getByPlaceholder('Full name').fill('Eval User (edited)');
  await page.getByRole('button', { name: 'Save' }).click();
  await row(page, 'Eval User (edited)').waitFor();

  await row(page, email).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Delete User' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await row(page, email).waitFor({ state: 'hidden' });
}

// Settings as the admin: update the profile's full name. The name is unique per
// run because Save stays disabled when the name doesn't change.
async function exerciseProfile(page: Page): Promise<void> {
  const fullName = `Eval Admin ${RUN_ID}`;
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Full name').fill(fullName);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('form').getByText(fullName, { exact: true }).waitFor();
}

// Calls the API from inside the page with the app's stored token, so the browser
// records them: operations the UI never calls, paging, direct DELETEs (the UI's
// are recorded as aborted), and errors. Only statuses come back to Node.
async function exerciseApiDirectly(page: Page): Promise<void> {
  const results = await page.evaluate(async (runId) => {
    const token = localStorage.getItem('access_token');
    const out: [string, number, number][] = [];
    const call = async (label: string, expected: number, method: string, path: string, body?: unknown) => {
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          // 'anonymous' calls skip the token, to record a 401.
          ...(label.startsWith('anonymous') ? {} : { Authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // Read the whole body so Chrome reports the request as finished (task 1.4).
      const text = await response.text();
      out.push([label, expected, response.status]);
      const isJson = response.headers.get('content-type')?.includes('json');
      return isJson && text ? (JSON.parse(text) as { id?: string }) : {};
    };

    await call('health check', 200, 'GET', '/utils/health-check/');
    await call('test token', 200, 'POST', '/login/test-token');
    await call('items page 1', 200, 'GET', '/items/?skip=0&limit=2');
    await call('items page 2', 200, 'GET', '/items/?skip=2&limit=2');
    const item = await call('create item', 200, 'POST', '/items/', { title: `Eval API item ${runId}` });
    await call('read item', 200, 'GET', `/items/${item.id}`);
    await call('missing item', 404, 'GET', '/items/00000000-0000-0000-0000-000000000000');
    await call('malformed item id', 422, 'GET', '/items/not-a-uuid');
    await call('item without title', 422, 'POST', '/items/', {});
    await call('delete item', 200, 'DELETE', `/items/${item.id}`);
    await call('users page', 200, 'GET', '/users/?skip=0&limit=1');
    await call('anonymous read me', 401, 'GET', '/users/me');
    const me = await call('read me', 200, 'GET', '/users/me');
    await call('read user', 200, 'GET', `/users/${me.id}`);
    const user = await call('create user', 200, 'POST', '/users/', {
      email: `eval-api-${runId}@example.com`,
      password: 'eval-only-api-pass',
    });
    await call('delete user', 200, 'DELETE', `/users/${user.id}`);
    // Superuser-only test email (sent to Mailcatcher). Not called:
    // POST /password-recovery-html-content/{email}, which crashes the server
    // after a 200 in this template version (see eval/known-spec-issues.md).
    await call('test email', 201, 'POST', `/utils/test-email/?email_to=eval-mail-${runId}%40example.com`);
    return out;
  }, RUN_ID);

  const wrong = results.filter(([, expected, actual]) => expected !== actual);
  if (wrong.length > 0) {
    const detail = wrong.map(([label, expected, actual]) => `${label}: expected ${expected}, got ${actual}`);
    throw new Error(`Unexpected API statuses:\n${detail.join('\n')}`);
  }
}

// Public sign-up (then a duplicate, which the API rejects with 400), and the
// new user's own account: change password, recover it by email (plus an invalid
// reset token, 400), log in with the reset password, delete the account.
async function exerciseSignUpAndAccount(page: Page): Promise<void> {
  const email = `eval-signup-${RUN_ID}@example.com`;
  const password = 'eval-only-signup-pass';
  const newPassword = 'eval-only-changed-pass';
  const resetPassword = 'eval-only-reset-pass';
  const signUp = async () => {
    await page.goto('/signup');
    await page.getByTestId('full-name-input').fill('Eval Signup');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill(password);
    await page.getByTestId('confirm-password-input').fill(password);
    await page.getByRole('button', { name: 'Sign Up' }).click();
  };
  await signUp();
  await page.waitForURL(/\/login$/);
  await signUp();
  await page.getByText('The user with this email already exists in the system').waitFor();

  await logIn(page, email, password);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByTestId('current-password-input').fill(password);
  await page.getByTestId('new-password-input').fill(newPassword);
  await page.getByTestId('confirm-password-input').fill(newPassword);
  await page.getByRole('button', { name: 'Update Password' }).click();
  await page.getByText('Password updated successfully').waitFor();
  await logOut(page);

  const fillNewPassword = async (value: string) => {
    await page.getByTestId('new-password-input').fill(value);
    await page.getByTestId('confirm-password-input').fill(value);
  };
  await page.goto('/reset-password?token=invalidtoken');
  await fillNewPassword(resetPassword);
  const invalid = await clickAndWaitForApi(page, page.getByRole('button', { name: 'Reset Password' }), 'POST', '/reset-password/');
  if (invalid.status() !== 400) throw new Error(`Invalid reset token: expected 400, got ${invalid.status()}`);

  await page.goto('/recover-password');
  await page.getByTestId('email-input').fill(email);
  await clickAndWaitForApi(page, page.getByRole('button', { name: 'Continue' }), 'POST', `/password-recovery/${email}`);
  await page.goto(await resetLinkFor(email));
  await fillNewPassword(resetPassword);
  const reset = await clickAndWaitForApi(page, page.getByRole('button', { name: 'Reset Password' }), 'POST', '/reset-password/');
  if (reset.status() !== 200) throw new Error(`Password reset: expected 200, got ${reset.status()}`);
  await logIn(page, email, resetPassword);

  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Danger zone' }).click();
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await clickAndWaitForApi(page, page.getByRole('button', { name: 'Delete', exact: true }), 'DELETE', '/users/me');
  await page.waitForURL(/\/login$/);
}

await assertAppIsUp();
await mkdir(dirname(HAR_PATH), { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    // Everything the browser loads, bodies included: static assets are the
    // realistic noise the engine's filter (task 1.10) must remove.
    recordHar: { path: HAR_PATH, content: 'embed' },
  });
  const page = await context.newPage();

  await logIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await exerciseItems(page);
  await exerciseAdminUsers(page);
  await exerciseProfile(page);
  await exerciseApiDirectly(page);
  await logOut(page);
  await exerciseSignUpAndAccount(page);

  // The HAR file is written when the context closes.
  await context.close();
} finally {
  await browser.close();
}

// Asset bodies (minified JS, CSS, images) are most of the file and nothing in
// the engine reads them, so drop them. The entries stay: they're the realistic
// noise the filter must remove. Pretty-print so diffs show what changed.
const KEEP_BODY_TYPES = new Set(['document', 'xhr', 'fetch']);
interface HarEntry {
  _resourceType?: string;
  response: { content: { text?: string; encoding?: string; comment?: string } };
}
const har = JSON.parse(await readFile(HAR_PATH, 'utf8')) as { log: { entries: HarEntry[] } };
for (const entry of har.log.entries) {
  const { content } = entry.response;
  if (content.text === undefined || KEEP_BODY_TYPES.has(entry._resourceType ?? '')) continue;
  delete content.text;
  delete content.encoding;
  content.comment = 'Body omitted by eval/scripts/record-fastapi.ts (static asset)';
}
await writeFile(HAR_PATH, `${JSON.stringify(har, null, 2)}\n`);
console.log(`Saved ${HAR_PATH}`);
