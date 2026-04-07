import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const templatePath = path.join(workspaceRoot, 'teams', 'manifest.template.json');
const distDir = path.join(workspaceRoot, 'teams', 'dist');
const outputPath = path.join(distDir, 'manifest.json');

const appUrl = process.env.APP_URL;
if (!appUrl) {
  console.error('APP_URL is required to render the Teams manifest.');
  process.exit(1);
}

let appHost;
try {
  appHost = new URL(appUrl).host;
} catch {
  console.error(`APP_URL must be a valid absolute URL. Received: ${appUrl}`);
  process.exit(1);
}

const replacements = {
  TEAMS_APP_ID: process.env.TEAMS_APP_ID || '00000000-0000-0000-0000-000000000000',
  TEAMS_PACKAGE_NAME: process.env.TEAMS_PACKAGE_NAME || 'com.mastiff.ai',
  APP_NAME: process.env.TEAMS_APP_NAME || 'Mastiff AI',
  APP_SHORT_DESCRIPTION: process.env.TEAMS_SHORT_DESCRIPTION || 'AI-powered data analysis in Microsoft Teams.',
  APP_LONG_DESCRIPTION: process.env.TEAMS_LONG_DESCRIPTION || 'Analyze files, connectors, and live data from a Teams-hosted Mastiff workspace.',
  APP_URL: appUrl.replace(/\/$/, ''),
  APP_HOST: appHost,
  DEVELOPER_NAME: process.env.TEAMS_DEVELOPER_NAME || 'Mastiff',
  DEVELOPER_WEBSITE_URL: process.env.TEAMS_DEVELOPER_WEBSITE_URL || appUrl.replace(/\/$/, ''),
  DEVELOPER_PRIVACY_URL: process.env.TEAMS_DEVELOPER_PRIVACY_URL || `${appUrl.replace(/\/$/, '')}/privacy`,
  DEVELOPER_TERMS_URL: process.env.TEAMS_DEVELOPER_TERMS_URL || `${appUrl.replace(/\/$/, '')}/terms`,
};

const template = fs.readFileSync(templatePath, 'utf8');
const manifest = template.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => {
  if (!(key in replacements)) {
    throw new Error(`Unknown Teams manifest placeholder: ${key}`);
  }

  return replacements[key];
});

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outputPath, `${manifest}\n`, 'utf8');

console.log(`Rendered Teams manifest to ${outputPath}`);