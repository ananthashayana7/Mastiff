import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const configuredBaseUrl = process.env.UI_PROBE_BASE_URL || 'http://localhost:3005';
const baseUrl = configuredBaseUrl.replace('://localhost', '://127.0.0.1');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(process.cwd(), 'logs', 'ui-probe', `${timestamp}-inspector`);
const browserCandidates = [
  process.env.UI_PROBE_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const uploadFilePath = path.join(process.cwd(), 'uploads', '1775809078914-S4_LineRejection.xlsx');

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function resolveBrowserLaunchOptions() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return { headless: true, executablePath: candidate };
    } catch {
      // ignore and continue
    }
  }
  return { headless: true };
}

function toPlaywrightCookies(setCookieHeaders, originUrl) {
  const origin = new URL(originUrl);
  return setCookieHeaders.map((header) => {
    const [nameValue] = header.split(';');
    const separatorIndex = nameValue.indexOf('=');
    const name = nameValue.slice(0, separatorIndex);
    const value = nameValue.slice(separatorIndex + 1);
    return {
      name,
      value,
      domain: origin.hostname,
      path: '/',
      httpOnly: true,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax',
    };
  });
}

async function createAuthenticatedContext(context, email, password) {
  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Inspector Probe', email, password }),
  });

  if (!signupResponse.ok) {
    throw new Error(`Signup failed: ${signupResponse.status} ${await signupResponse.text()}`);
  }

  const payload = await signupResponse.json();
  const setCookieHeaders = typeof signupResponse.headers.getSetCookie === 'function'
    ? signupResponse.headers.getSetCookie()
    : [];

  if (setCookieHeaders.length > 0) {
    await context.addCookies(toPlaywrightCookies(setCookieHeaders, baseUrl));
  }

  await context.addInitScript((user) => {
    window.localStorage.setItem('mastiff_user', JSON.stringify(user));
    window.localStorage.removeItem('mastiff_token');
  }, payload.user);
}

async function waitForWorkspace(page) {
  await page.waitForSelector('textarea[placeholder*="Ask Mastiff anything"]', { timeout: 120000 });
}

async function main() {
  await ensureDir(outputDir);
  await access(uploadFilePath);

  const email = `inspector-probe-${Date.now()}@beagle.ai`;
  const password = 'SecurePassword123!@#';
  const browser = await chromium.launch(await resolveBrowserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1560, height: 1800 } });
  const page = await context.newPage();

  try {
    await createAuthenticatedContext(context, email, password);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForWorkspace(page);

    await page.locator('input[type="file"]').setInputFiles(uploadFilePath);

    await page.waitForFunction(() => {
      return document.body.innerText.includes('Pending Review') || document.body.innerText.includes('S4_LineRejection.xlsx');
    }, undefined, { timeout: 120000 });

    const reviewTrigger = page.getByTitle('Review schema');
    if (await reviewTrigger.count()) {
      await reviewTrigger.first().click();
    } else {
      await page.getByText('S4_LineRejection.xlsx', { exact: false }).first().click();
    }

    await page.waitForFunction(() => document.body.innerText.includes('Data Inspector'), undefined, { timeout: 120000 });
    await page.screenshot({ path: path.join(outputDir, 'data-inspector.png'), fullPage: true });

    const bodyText = await page.evaluate(() => document.body.innerText || '');
    await writeFile(path.join(outputDir, 'body.txt'), bodyText, 'utf8');
    await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      success: true,
      outputDir,
      email,
      uploadFilePath,
    }, null, 2), 'utf8');

    console.log(JSON.stringify({ success: true, outputDir, uploadFilePath }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(async (error) => {
  await ensureDir(outputDir);
  await writeFile(path.join(outputDir, 'error.txt'), String(error?.stack || error), 'utf8');
  console.error(error);
  process.exitCode = 1;
});