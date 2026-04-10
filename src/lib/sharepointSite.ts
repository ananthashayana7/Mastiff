const SHAREPOINT_HOST_RE = /\.sharepoint\.com$/i;
const SITE_CONTAINER_SEGMENTS = new Set(['sites', 'teams', 'personal']);
const SITE_PATH_STOP_RE = /^(shared documents|documents|forms|_layouts|sitepages|lists|allitems\.aspx|onedrive\.aspx)$/i;

export interface SharePointSiteLookup {
  hostname: string;
  normalizedUrl: string;
  pathCandidates: string[];
}

export interface ResolvedSharePointSite {
  siteId: string;
  hostname: string;
  normalizedUrl: string;
  sitePath: string | null;
  webUrl?: string;
  displayName?: string;
}

function ensureUrlProtocol(rawValue: string): string {
  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }
  return `https://${rawValue}`;
}

function buildPathCandidates(pathname: string): string[] {
  const segments = pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return [''];
  }

  const first = segments[0]?.toLowerCase();
  if (!SITE_CONTAINER_SEGMENTS.has(first)) {
    return [''];
  }

  const collected: string[] = [];
  for (const segment of segments) {
    const normalized = segment.toLowerCase();
    if (collected.length >= 2 && (SITE_PATH_STOP_RE.test(normalized) || /\.[a-z0-9]+$/i.test(normalized))) {
      break;
    }
    collected.push(segment);
  }

  const candidates: string[] = [];
  for (let length = collected.length; length >= Math.min(2, collected.length); length -= 1) {
    candidates.push(`/${collected.slice(0, length).join('/')}`);
  }

  if (candidates.length === 0) {
    candidates.push('');
  }

  return Array.from(new Set(candidates));
}

export function parseSharePointSiteInput(rawValue: string): SharePointSiteLookup {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    throw new Error('SharePoint config requires either siteId or a siteUrl starting with https://prettlcloud.sharepoint.com/');
  }

  let parsed: URL;
  try {
    parsed = new URL(ensureUrlProtocol(trimmed));
  } catch {
    throw new Error('SharePoint siteUrl must be a valid URL or hostname.');
  }

  if (!SHAREPOINT_HOST_RE.test(parsed.hostname)) {
    throw new Error('SharePoint siteUrl must point to a *.sharepoint.com host.');
  }

  return {
    hostname: parsed.hostname,
    normalizedUrl: `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`,
    pathCandidates: buildPathCandidates(parsed.pathname),
  };
}

function buildGraphSiteEndpoint(hostname: string, sitePath: string): string {
  return sitePath ? `/sites/${hostname}:${sitePath}` : `/sites/${hostname}`;
}

export async function resolveSharePointSite(
  client: { get: (path: string) => Promise<{ data?: any }> },
  rawValue: string,
): Promise<ResolvedSharePointSite> {
  const lookup = parseSharePointSiteInput(rawValue);

  let lastError: unknown;
  for (const candidate of lookup.pathCandidates) {
    try {
      const response = await client.get(buildGraphSiteEndpoint(lookup.hostname, candidate));
      const site = response?.data || {};
      const siteId = String(site.id || '').trim();
      if (!siteId) {
        throw new Error('Microsoft Graph did not return a site ID.');
      }

      return {
        siteId,
        hostname: lookup.hostname,
        normalizedUrl: lookup.normalizedUrl,
        sitePath: candidate || null,
        webUrl: typeof site.webUrl === 'string' ? site.webUrl : undefined,
        displayName: typeof site.displayName === 'string' ? site.displayName : undefined,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const details = lastError instanceof Error ? ` ${lastError.message}` : '';
  throw new Error(`Could not resolve the SharePoint site from the provided siteUrl.${details}`);
}