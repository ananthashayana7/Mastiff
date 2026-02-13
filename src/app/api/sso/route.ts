/**
 * SSO API Routes - SAML and OAuth2 Configuration and Authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { RBACEngine } from '@/src/services/rbacService';
import { SAMLService } from '@/src/services/samlService';
import { OAuth2Service } from '@/src/services/oauth2Service';
import crypto from 'crypto';

const rbacEngine = new RBACEngine();

// ============================================================================
// SAML Routes
// ============================================================================

/**
 * GET /api/sso/saml/metadata
 * Get SAML Service Provider metadata
 */
export async function GET_SAMLMetadata(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const organizationId = searchParams.get('organizationId');

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        const config = await SAMLService.getConfigByOrganization(organizationId);
        if (!config) {
            return NextResponse.json(
                { error: 'SAML configuration not found' },
                { status: 404 }
            );
        }

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const metadata = SAMLService.generateSPMetadata(appUrl, config);

        return new NextResponse(metadata, {
            headers: { 'Content-Type': 'application/xml' },
        });
    } catch (error) {
        console.error('Error generating SAML metadata:', error);
        return NextResponse.json(
            { error: 'Failed to generate metadata' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sso/saml/config
 * Create or update SAML configuration
 */
export async function POST_SAMLConfig(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, ...config } = body;

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'organization',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const samlConfig = await SAMLService.createConfig({
            ...config,
            organizationId,
            createdBy: session.user.id,
        });

        return NextResponse.json(
            {
                config: samlConfig,
                message: 'SAML configuration created',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating SAML config:', error);
        return NextResponse.json(
            { error: 'Failed to create configuration' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/sso/saml/initiate
 * Initiate SAML authentication
 */
export async function GET_SAMLInitiate(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const organizationId = searchParams.get('organizationId');

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        const config = await SAMLService.getConfigByOrganization(organizationId);
        if (!config) {
            return NextResponse.json(
                { error: 'SAML not configured for this organization' },
                { status: 404 }
            );
        }

        if (!config.isEnabled) {
            return NextResponse.json(
                { error: 'SAML is not enabled' },
                { status: 403 }
            );
        }

        const { session, requestId, authUrl } = await SAMLService.createSession(
            config.id,
            organizationId
        );

        return NextResponse.json({
            authUrl: config.authenticationUrl,
            samlRequest: authUrl,
            requestId,
            sessionId: session.id,
        });
    } catch (error) {
        console.error('Error initiating SAML auth:', error);
        return NextResponse.json(
            { error: 'Failed to initiate authentication' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sso/saml/callback
 * SAML response callback
 */
export async function POST_SAMLCallback(req: NextRequest) {
    try {
        const body = await req.formData();
        const samlResponse = body.get('SAMLResponse') as string;
        const relayState = body.get('RelayState') as string;

        if (!samlResponse) {
            return NextResponse.json(
                { error: 'SAMLResponse is required' },
                { status: 400 }
            );
        }

        // Extract organization from relay state or request
        const organizationId = relayState || new URL(req.url).searchParams.get('org');

        if (!organizationId) {
            return NextResponse.json(
                { error: 'Unable to determine organization' },
                { status: 400 }
            );
        }

        const config = await SAMLService.getConfigByOrganization(organizationId);
        if (!config) {
            throw new Error('SAML configuration not found');
        }

        // Process SAML response
        const { userId, email, attributes } = await SAMLService.processSAMLResponse(
            config.id,
            samlResponse,
            relayState
        );

        // In production, would:
        // 1. Create or update user
        // 2. Assign roles based on group mappings
        // 3. Redirect to login completion endpoint

        await SAMLService.auditEvent({
            organizationId,
            samlConfigId: config.id,
            userId,
            eventType: 'saml_login',
            status: 'success',
            metadata: { email, attributes },
        });

        return NextResponse.json({
            success: true,
            userId,
            email,
            attributes,
        });
    } catch (error) {
        console.error('Error processing SAML callback:', error);

        await SAMLService.auditEvent({
            organizationId: '',
            samlConfigId: '',
            eventType: 'saml_login',
            status: 'failure',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        return NextResponse.json(
            { error: 'Failed to process SAML response' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sso/saml/test
 * Test SAML configuration
 */
export async function POST_SAMLTest(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { samlConfigId, organizationId } = body;

        if (!samlConfigId || !organizationId) {
            return NextResponse.json(
                { error: 'samlConfigId and organizationId are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'organization',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const result = await SAMLService.testConfiguration(samlConfigId);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error testing SAML config:', error);
        return NextResponse.json(
            { error: 'Failed to test configuration' },
            { status: 500 }
        );
    }
}

// ============================================================================
// OAuth2 Routes
// ============================================================================

/**
 * POST /api/sso/oauth2/config
 * Create or update OAuth2 configuration
 */
export async function POST_OAuth2Config(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, ...config } = body;

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'organization',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const oauth2Config = await OAuth2Service.createConfig({
            ...config,
            organizationId,
            createdBy: session.user.id,
        });

        return NextResponse.json(
            {
                config: oauth2Config,
                message: 'OAuth2 configuration created',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating OAuth2 config:', error);
        return NextResponse.json(
            { error: 'Failed to create configuration' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/sso/oauth2/authorize
 * Generate OAuth2 authorization URL
 */
export async function GET_OAuth2Authorize(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const oauth2ConfigId = searchParams.get('oauth2ConfigId');
        const organizationId = searchParams.get('organizationId');

        if (!oauth2ConfigId || !organizationId) {
            return NextResponse.json(
                { error: 'oauth2ConfigId and organizationId are required' },
                { status: 400 }
            );
        }

        const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/auth/oauth2/callback`;

        // Generate PKCE challenge
        const codeVerifier = crypto
            .randomBytes(32)
            .toString('base64url')
            .replace(/[^a-zA-Z0-9_-]/g, '');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url')
            .replace(/[^a-zA-Z0-9_-]/g, '');

        const { url, state, sessionId } = await OAuth2Service.generateAuthorizationUrl(
            oauth2ConfigId,
            redirectUri,
            undefined,
            codeChallenge
        );

        return NextResponse.json({
            authUrl: url,
            state,
            sessionId,
            codeVerifier, // Client should store this
        });
    } catch (error) {
        console.error('Error generating authorization URL:', error);
        return NextResponse.json(
            { error: 'Failed to generate authorization URL' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sso/oauth2/callback
 * OAuth2 callback handler
 */
export async function POST_OAuth2Callback(req: NextRequest) {
    try {
        const body = await req.json();
        const { code, state, codeVerifier, oauth2ConfigId, organizationId } = body;

        if (!code || !state || !oauth2ConfigId || !organizationId) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            );
        }

        const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/auth/oauth2/callback`;

        // Exchange code for tokens
        const tokens = await OAuth2Service.exchangeCode(
            oauth2ConfigId,
            code,
            redirectUri,
            codeVerifier
        );

        // Get user info
        const userInfo = await OAuth2Service.getUserInfo(oauth2ConfigId, tokens.accessToken);

        // In production, would:
        // 1. Create or update user
        // 2. Assign roles based on group mappings
        // 3. Create session

        await OAuth2Service.auditEvent(
            organizationId,
            oauth2ConfigId,
            'oauth2_login',
            'success',
            undefined,
            userInfo.email
        );

        return NextResponse.json({
            success: true,
            userInfo,
            tokens,
        });
    } catch (error) {
        console.error('Error processing OAuth2 callback:', error);

        return NextResponse.json(
            { error: 'Failed to process OAuth2 callback' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sso/oauth2/test
 * Test OAuth2 configuration
 */
export async function POST_OAuth2Test(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { oauth2ConfigId, organizationId } = body;

        if (!oauth2ConfigId || !organizationId) {
            return NextResponse.json(
                { error: 'oauth2ConfigId and organizationId are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'organization',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const result = await OAuth2Service.testConfiguration(oauth2ConfigId);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error testing OAuth2 config:', error);
        return NextResponse.json(
            { error: 'Failed to test configuration' },
            { status: 500 }
        );
    }
}
