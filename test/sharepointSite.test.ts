import { describe, expect, it } from 'vitest';

import { parseSharePointSiteInput, resolveSharePointSite } from '../src/lib/sharepointSite';

describe('sharepointSite', () => {
  it('accepts plain SharePoint hostnames and produces a root-site lookup candidate', () => {
    const parsed = parseSharePointSiteInput('prettlcloud.sharepoint.com');

    expect(parsed.hostname).toBe('prettlcloud.sharepoint.com');
    expect(parsed.pathCandidates).toEqual(['']);
  });

  it('normalizes a site URL and strips document-library segments from lookup candidates', () => {
    const parsed = parseSharePointSiteInput('https://prettlcloud.sharepoint.com/sites/Finance/Shared%20Documents/Forms/AllItems.aspx');

    expect(parsed.hostname).toBe('prettlcloud.sharepoint.com');
    expect(parsed.pathCandidates[0]).toBe('/sites/Finance');
  });

  it('resolves the first successful Graph site candidate', async () => {
    const attempted: string[] = [];
    const client = {
      get: async (path: string) => {
        attempted.push(path);
        if (path === '/sites/prettlcloud.sharepoint.com:/sites/Finance') {
          return {
            data: {
              id: 'tenant,site,web',
              webUrl: 'https://prettlcloud.sharepoint.com/sites/Finance',
              displayName: 'Finance',
            },
          };
        }
        throw new Error('not found');
      },
    };

    const resolved = await resolveSharePointSite(client, 'https://prettlcloud.sharepoint.com/sites/Finance/Shared Documents');

    expect(attempted[0]).toBe('/sites/prettlcloud.sharepoint.com:/sites/Finance');
    expect(resolved.siteId).toBe('tenant,site,web');
    expect(resolved.webUrl).toBe('https://prettlcloud.sharepoint.com/sites/Finance');
  });
});