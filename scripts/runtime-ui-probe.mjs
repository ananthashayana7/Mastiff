import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const configuredBaseUrl = process.env.UI_PROBE_BASE_URL || 'http://localhost:3005';
const baseUrl = configuredBaseUrl.replace('://localhost', '://127.0.0.1');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(process.cwd(), 'logs', 'ui-probe', timestamp);
const browserCandidates = [
  process.env.UI_PROBE_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const financePrompt = `PreBo Statement of Profit and loss for the year Jan to June 2025 ( Amt T INR)\t\t\t\t\t\t\t\t\t\tPreBo Statement of Profit and loss for the year  (YTD)  June 2025 (Amt T INR)
Particulars\tNotes\tJan'25\tFeb'25\tMar'25\tApr'25\tMay'25\tJun'25\t\t\t\t Jan'25\tYTD Feb'25\tYTD Mar'25\tYTD Apr'25\tYTD May'25\tYTD Jun'25
A- Total Income
Revenue from operations\t1\t 1,10,109 \t 1,09,935 \t 1,16,567 \t 1,10,771 \t 1,18,800 \t 1,09,395 \t\t\t\t 1,10,109 \t 2,20,044 \t 3,36,611 \t 4,47,382 \t 5,66,182 \t 6,75,577 
Other income\t2\t 255 \t 169 \t 296 \t 2,703 \t -   \t -   \t\t\t\t 255 \t 424 \t 720 \t 3,423 \t 3,423 \t 3,423 
Total Income\t\t 1,10,364 \t 1,10,104 \t 1,16,863 \t 1,13,474 \t 1,18,800 \t 1,09,395 \t\t\t\t 1,10,364 \t 2,20,468 \t 3,37,331 \t 4,50,804 \t 5,69,604 \t 6,79,000 
B- Total Expenses
Cost of raw material consumed\t3\t -60,541 \t -73,160 \t -83,364 \t -70,013 \t -56,738 \t -65,273 \t\t\t\t -60,541 \t -1,33,701 \t -2,17,066 \t -2,87,078 \t -3,43,816 \t -4,09,089 
Changes in inventories of finished goods and work-in-progress\t4\t 1,596 \t 428 \t 13,096 \t 5,135 \t -24,325 \t 1,493 \t\t\t\t 1,596 \t 2,025 \t 15,121 \t 20,256 \t -4,069 \t -2,576 
Employee benefits expense\t5\t -19,018 \t -17,609 \t -26,572 \t -25,294 \t -21,899 \t -19,234 \t\t\t\t -19,018 \t -36,627 \t -63,199 \t -88,493 \t -1,10,392 \t -1,29,625 
Finance costs\t6\t -   \t -   \t -   \t -   \t -   \t -   \t\t\t\t -   \t -   \t -   \t -   \t -   \t -   
Depreciation and amortisation expenses\t7\t -2,978 \t -2,737 \t 457 \t -6,049 \t -3,057 \t -5,915 \t\t\t\t -2,978 \t -5,714 \t -5,257 \t -11,306 \t -14,363 \t -20,278 
Other expenses\t8\t -11,390 \t -10,083 \t -14,158 \t -11,856 \t -12,056 \t -12,266 \t\t\t\t -11,390 \t -21,473 \t -35,631 \t -47,487 \t -59,543 \t -71,808 
Total expenses\t\t -92,330 \t -1,03,161 \t -1,10,542 \t -1,08,076 \t -1,18,075 \t -1,01,194 \t\t\t\t -92,330 \t -1,95,490 \t -3,06,032 \t -4,14,108 \t -5,32,183 \t -6,33,377 
Profit before tax (EBIT)\t\t 18,035 \t 6,943 \t 6,321 \t 5,397 \t 725 \t 8,201 \t\t\t\t 18,035 \t 24,978 \t 31,299 \t 36,696 \t 37,421 \t 45,622 
Current tax\t\t -4,691 \t -1,805 \t -1,647 \t -1,405 \t -191 \t -1,967 \t\t\t\t -4,691 \t -6,496 \t -8,143 \t -9,548 \t -9,739 \t -11,706 
Deferred tax\t\t -   \t -   \t -   \t -   \t -   \t -   \t\t\t\t -   \t -   \t -   \t -   \t -   \t -   
Profit for the year (PAT)\t\t 13,344 \t 5,138 \t 4,674 \t 3,992 \t 535 \t 6,234 \t\t\t\t 13,344 \t 18,482 \t 23,156 \t 27,148 \t 27,683 \t 33,917 

Analyze this financial statement. I need a management-grade summary, clearer insight variation, named charts, and an explicit forecast basis.`;

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function resolveBrowserLaunchOptions() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return {
        headless: true,
        executablePath: candidate,
      };
    } catch {
      // ignored
    }
  }

  return { headless: true };
}

async function waitForWorkspace(page) {
  await page.waitForFunction(() => {
    const textareas = Array.from(document.querySelectorAll('textarea'));
    return textareas.some((node) => node.getAttribute('placeholder')?.includes('Ask Mastiff anything'));
  }, undefined, { timeout: 120000 });
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
  let signupResponse;
  let lastSignupError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'UI Probe',
          email,
          password,
        }),
      });
      break;
    } catch (error) {
      lastSignupError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  if (!signupResponse) {
    throw lastSignupError || new Error('Signup request failed before receiving a response.');
  }

  if (!signupResponse.ok) {
    const errorBody = await signupResponse.text();
    throw new Error(`Signup request failed: ${signupResponse.status} ${errorBody}`);
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

async function clickComposerSend(page) {
  const sent = await page.evaluate(() => {
    const textarea = Array.from(document.querySelectorAll('textarea')).find((node) => node.getAttribute('placeholder')?.includes('Ask Mastiff anything'));
    if (!textarea) return false;
    const button = textarea.parentElement?.querySelector('button:last-of-type');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });

  if (!sent) {
    throw new Error('Failed to locate composer send button.');
  }
}

async function main() {
  await ensureDir(outputDir);

  const email = `ui-probe-${Date.now()}@beagle.ai`;
  const password = 'SecurePassword123!@#';
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];

  const browser = await chromium.launch(await resolveBrowserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1560, height: 2200 } });
  const page = await context.newPage();

  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText || 'unknown' });
  });

  try {
    await createAuthenticatedContext(context, email, password);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

    await waitForWorkspace(page);
    await page.screenshot({ path: path.join(outputDir, 'workspace-ready.png'), fullPage: true });

    const textarea = page.locator('textarea').filter({ hasText: '' }).first();
    await textarea.fill(financePrompt);
    await clickComposerSend(page);

    await page.waitForFunction(() => {
      const text = document.body.innerText || '';
      return text.includes('Executive Signal') && text.includes('Data Quality');
    }, undefined, { timeout: 300000 });

    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(outputDir, 'analysis-result.png'), fullPage: true });

    const snapshot = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const basisLines = text.split('\n').filter((line) => line.includes('Forecasting ') || line.startsWith('Basis'));
      const autoChartTitle = text.split('\n').find((line) => line.includes('CHART ·')) || null;
      return {
        bodyText: text,
        basisLines,
        autoChartTitle,
        url: window.location.href,
      };
    });

    await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      baseUrl,
      email,
      snapshot,
      consoleMessages,
      pageErrors,
      requestFailures,
    }, null, 2), 'utf8');

    await writeFile(path.join(outputDir, 'body.txt'), snapshot.bodyText, 'utf8');

    console.log(JSON.stringify({
      success: true,
      outputDir,
      email,
      autoChartTitle: snapshot.autoChartTitle,
      basisLines: snapshot.basisLines,
      pageErrors,
      requestFailures,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(async (error) => {
  const errorText = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
  await ensureDir(outputDir);
  await writeFile(path.join(outputDir, 'error.txt'), errorText, 'utf8');
  console.error(errorText);
  process.exitCode = 1;
});