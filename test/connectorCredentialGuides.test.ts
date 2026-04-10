import { describe, it, expect } from 'vitest';

/**
 * Tests for the connector credential guide data structure.
 * Validates that every connector type has a well-formed help guide
 * with field descriptions and setup steps.
 */

type ConnectorType = 'sheets' | 'sharepoint' | 'snowflake' | 'bigquery' | 'postgres' | 'api';

const connectorCredentialGuides: Record<ConnectorType, { fields: { name: string; description: string }[]; steps: string[] }> = {
    sheets: {
        fields: [
            { name: 'refreshToken', description: 'A long-lived token that lets Mastiff access your Google Sheets without re-authenticating. It is obtained through the Google OAuth 2.0 consent flow.' },
            { name: 'spreadsheetId', description: 'The unique ID of your Google Sheets spreadsheet. You can find it in the spreadsheet URL: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit. It is the long string of characters between /d/ and /edit. This field is optional — if omitted, Mastiff will list all accessible spreadsheets.' },
        ],
        steps: [
            'Go to the Google Cloud Console (console.cloud.google.com) and create or select a project.',
            'Enable the Google Sheets API and Google Drive API for your project.',
            'Go to "APIs & Services → Credentials" and create an OAuth 2.0 Client ID (Web application type).',
            'Set the redirect URI to your Mastiff instance URL (e.g. http://localhost:3000/api/auth/callback/google).',
            'Use the generated Client ID and Client Secret to complete the OAuth consent flow.',
            'After authorizing, you will receive a refresh token — paste it into the "refreshToken" field above.',
            'To find your Spreadsheet ID, open the Google Sheet and copy the ID from the URL between /d/ and /edit.',
        ],
    },
    sharepoint: {
        fields: [
            { name: 'tenantId', description: 'Azure AD tenant ID (GUID) for your Microsoft 365 organization.' },
            { name: 'clientId', description: 'Application (client) ID from your Azure App Registration used for Graph API access.' },
            { name: 'clientSecret', description: 'Client secret generated for your Azure App Registration.' },
            { name: 'refreshToken', description: 'OAuth refresh token for delegated Graph access to SharePoint resources.' },
            { name: 'siteUrl', description: 'Preferred input. Paste the SharePoint site URL or tenant root, for example https://prettlcloud.sharepoint.com/sites/finance or https://prettlcloud.sharepoint.com/. Mastiff will resolve the Graph site automatically.' },
            { name: 'siteId', description: 'Optional override if you already know the Microsoft Graph Site ID. If siteUrl is present, Mastiff can populate siteId automatically after a successful test.' },
            { name: 'driveId', description: 'Optional specific document library drive ID. If omitted, all site drives are listed.' },
        ],
        steps: [
            'Create an app registration in Azure Portal and grant Microsoft Graph delegated permissions: Files.Read, Sites.Read.All, offline_access.',
            'Create a client secret and copy tenantId, clientId, and clientSecret from the app registration overview.',
            'Run OAuth consent flow to obtain a refresh token for the SharePoint user context.',
            'Paste your SharePoint URL, for example https://prettlcloud.sharepoint.com/sites/finance. You do not need Graph Explorer for the normal setup path.',
            'Test the connector once; Mastiff will resolve and store the Microsoft Graph siteId automatically.',
            'Optionally provide driveId to lock Mastiff to one document library; otherwise all available libraries are listed.',
        ],
    },
    snowflake: {
        fields: [
            { name: 'account', description: 'Your Snowflake account identifier, e.g. "xy12345.us-east-1". Found in your Snowflake login URL.' },
            { name: 'username', description: 'Your Snowflake login username.' },
            { name: 'password', description: 'Your Snowflake login password.' },
            { name: 'database', description: 'The name of the Snowflake database to connect to.' },
            { name: 'schema', description: 'The schema within the database (e.g. "PUBLIC").' },
            { name: 'warehouse', description: 'The Snowflake compute warehouse to use for queries (optional).' },
        ],
        steps: [
            'Log in to your Snowflake account at https://app.snowflake.com.',
            'Your account identifier is in the URL: https://{account}.snowflakecomputing.com.',
            'Use your Snowflake username and password for authentication.',
            'Choose a database and schema from the left panel in the Snowflake console.',
        ],
    },
    bigquery: {
        fields: [
            { name: 'projectId', description: 'Your Google Cloud project ID. Found in the Google Cloud Console dashboard.' },
            { name: 'datasetId', description: 'The BigQuery dataset to query (optional). If omitted, all datasets in the project are accessible.' },
            { name: 'serviceAccountKey', description: 'A JSON service account key for authentication. Download it from Google Cloud Console → IAM & Admin → Service Accounts.' },
        ],
        steps: [
            'Go to the Google Cloud Console (console.cloud.google.com) and select your project.',
            'Copy the Project ID from the dashboard.',
            'Go to "IAM & Admin → Service Accounts" and create a service account with BigQuery access.',
            'Create a JSON key for the service account and paste the entire JSON content into the "serviceAccountKey" field.',
        ],
    },
    postgres: {
        fields: [
            { name: 'host', description: 'The hostname or IP address of your PostgreSQL server (e.g. "localhost" or "db.example.com").' },
            { name: 'port', description: 'The port number (default: 5432).' },
            { name: 'database', description: 'The name of the database to connect to.' },
            { name: 'username', description: 'Your PostgreSQL username.' },
            { name: 'password', description: 'Your PostgreSQL password.' },
            { name: 'ssl', description: 'Whether to use SSL for the connection (true/false). Required for most cloud-hosted databases.' },
        ],
        steps: [
            'Get the connection details from your database provider or administrator.',
            'For cloud databases (e.g. AWS RDS, Supabase, Neon), find connection details in the provider dashboard.',
            'Ensure the database allows connections from your Mastiff server IP address.',
        ],
    },
    api: {
        fields: [
            { name: 'baseUrl', description: 'The base URL of the API (e.g. "https://api.example.com/v1").' },
            { name: 'authType', description: 'Authentication method: "apikey", "bearer", or "none" (optional).' },
            { name: 'apiKey', description: 'Your API key, if authType is "apikey" (optional).' },
            { name: 'bearerToken', description: 'Your Bearer token, if authType is "bearer" (optional).' },
        ],
        steps: [
            'Refer to the API documentation for the base URL and authentication method.',
            'Generate an API key or token from the API provider\'s dashboard.',
            'Set "authType" to match the authentication the API expects.',
        ],
    },
};

const connectorCredentialTemplates: Record<ConnectorType, string> = {
    sheets: '{\n  "refreshToken": "",\n  "spreadsheetId": ""\n}',
    sharepoint: '{\n  "tenantId": "",\n  "clientId": "",\n  "clientSecret": "",\n  "refreshToken": "",\n  "siteUrl": "https://prettlcloud.sharepoint.com/sites/example-site",\n  "siteId": "",\n  "driveId": ""\n}',
    snowflake: '{\n  "account": "",\n  "username": "",\n  "password": "",\n  "database": "",\n  "schema": "",\n  "warehouse": ""\n}',
    bigquery: '{\n  "projectId": "",\n  "datasetId": "",\n  "serviceAccountKey": "{}"\n}',
    postgres: '{\n  "host": "",\n  "port": 5432,\n  "database": "",\n  "username": "",\n  "password": "",\n  "ssl": false\n}',
    api: '{\n  "baseUrl": "https://api.example.com",\n  "authType": "apikey",\n  "apiKey": ""\n}',
};

const allConnectorTypes: ConnectorType[] = ['sheets', 'sharepoint', 'snowflake', 'bigquery', 'postgres', 'api'];

describe('Connector credential guides', () => {
    it('provides a guide for every connector type', () => {
        for (const type of allConnectorTypes) {
            expect(connectorCredentialGuides[type]).toBeDefined();
            expect(connectorCredentialGuides[type].fields.length).toBeGreaterThan(0);
            expect(connectorCredentialGuides[type].steps.length).toBeGreaterThan(0);
        }
    });

    it('every field has a non-empty name and description', () => {
        for (const type of allConnectorTypes) {
            for (const field of connectorCredentialGuides[type].fields) {
                expect(field.name.trim()).not.toBe('');
                expect(field.description.trim()).not.toBe('');
            }
        }
    });

    it('every step is a non-empty string', () => {
        for (const type of allConnectorTypes) {
            for (const step of connectorCredentialGuides[type].steps) {
                expect(step.trim()).not.toBe('');
            }
        }
    });

    it('guide fields cover all template keys for each connector type', () => {
        for (const type of allConnectorTypes) {
            const templateJson = JSON.parse(connectorCredentialTemplates[type]);
            const templateKeys = Object.keys(templateJson);
            const guideFieldNames = connectorCredentialGuides[type].fields.map((f) => f.name);

            for (const key of templateKeys) {
                expect(guideFieldNames).toContain(key);
            }
        }
    });

    it('Google Sheets guide mentions OAuth and refresh token process', () => {
        const sheetsGuide = connectorCredentialGuides.sheets;
        const allText = [
            ...sheetsGuide.fields.map((f) => f.description),
            ...sheetsGuide.steps,
        ].join(' ');

        expect(allText.toLowerCase()).toContain('oauth');
        expect(allText.toLowerCase()).toContain('refresh token');
        expect(allText).toContain('console.cloud.google.com');
    });

    it('Google Sheets guide explains where to find spreadsheetId in URL', () => {
        const sheetsGuide = connectorCredentialGuides.sheets;
        const spreadsheetField = sheetsGuide.fields.find((f) => f.name === 'spreadsheetId');

        expect(spreadsheetField).toBeDefined();
        expect(spreadsheetField!.description).toContain('docs.google.com/spreadsheets/d/');
        expect(spreadsheetField!.description.toLowerCase()).toContain('/d/');
        expect(spreadsheetField!.description.toLowerCase()).toContain('/edit');
    });

    it('SharePoint guide prefers siteUrl over manual Graph siteId lookup', () => {
        const sharepointGuide = connectorCredentialGuides.sharepoint;
        const allText = [
            ...sharepointGuide.fields.map((f) => `${f.name} ${f.description}`),
            ...sharepointGuide.steps,
        ].join(' ');

        expect(allText).toContain('https://prettlcloud.sharepoint.com/');
        expect(allText).toContain('siteUrl');
        expect(allText.toLowerCase()).toContain('resolve');
        expect(allText.toLowerCase()).toContain('you do not need graph explorer for the normal setup path');
    });
});
