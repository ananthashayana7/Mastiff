# SRS Gap Closure - Integration Guide

This document outlines how to integrate the newly implemented security and data connectivity services into existing API routes.

## Quick Reference

**New Services Created This Session**:
- ✅ `src/lib/encryption.ts` - Data encryption (AES-256-GCM)
- ✅ `src/lib/csrf.ts` - CSRF token protection
- ✅ `src/services/auditService.ts` - Audit logging
- ✅ `src/services/totpService.ts` - 2FA/TOTP authentication
- ✅ `src/services/connectorService.ts` - Multi-connector data integration
- ✅ `src/services/dockerSandboxExecutor.ts` - Sandboxed code execution
- ✅ `.github/workflows/ci-cd.yml` - GitHub Actions CI/CD pipeline

---

## Part 1: Authentication Enhancements

### 1.1 Add CSRF Protection to POST Routes

**File**: Any POST/PUT/DELETE route

```typescript
import { csrfMiddleware, csrfResponse } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  // Verify CSRF token
  const csrfTokenValid = await csrfMiddleware(req);
  if (!csrfTokenValid) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  
  // ... route handler code ...
}

export async function GET(req: NextRequest) {
  // Return CSRF token in response headers
  const sessionId = req.cookies.get('sessionId')?.value || generateSessionId();
  const response = NextResponse.json({ data: 'success' });
  const csrfHeaders = await csrfResponse(sessionId);
  
  Object.entries(csrfHeaders).forEach(([key, value]) => {
    response.headers.set(key, value as string);
  });
  
  return response;
}
```

### 1.2 Integrate 2FA into Login Flow

**File**: `src/app/api/auth/login/route.ts`

```typescript
import { TOTPService } from '@/services/totpService';
import { AuditService } from '@/services/auditService';

export async function POST(req: NextRequest) {
  try {
    const { email, password, totpCode } = await req.json();
    
    // ... existing password verification ...
    
    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // If no TOTP code provided, request it
      if (!totpCode) {
        return NextResponse.json({
          requires2FA: true,
          message: 'Please provide TOTP code'
        }, { status: 202 });
      }
      
      // Verify TOTP code
      const isValidCode = await TOTPService.verify2FACode(user.id, totpCode);
      if (!isValidCode) {
        await AuditService.logAuditAction({
          userId: user.id,
          action: 'login_failed',
          resourceType: 'user',
          resourceId: user.id,
          status: 'error',
          details: { reason: 'invalid_totp' },
          ipAddress: getClientIp(req.headers),
          userAgent: req.headers.get('user-agent') || '',
        });
        
        return NextResponse.json({
          error: 'Invalid 2FA code'
        }, { status: 401 });
      }
    }
    
    // ... generate JWT ...
    
    // Log successful login
    await AuditService.logAuditAction({
      userId: user.id,
      action: 'login_success',
      resourceType: 'user',
      resourceId: user.id,
      status: 'success',
      ipAddress: getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
    });
    
    return NextResponse.json({ token, user });
  } catch (error) {
    // Log error
    await AuditService.logAuditAction({
      userId: 'unknown',
      action: 'login_error',
      resourceType: 'auth',
      resourceId: 'login',
      status: 'error',
      error: error.message,
      ipAddress: getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
    });
  }
}
```

### 1.3 Create 2FA Setup Endpoint

**New File**: `src/app/api/auth/2fa/enable/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TOTPService } from '@/services/totpService';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    // Generate TOTP secret
    const { secret, qrCodeUri } = await TOTPService.enable2FA(user.id);
    
    return NextResponse.json({
      secret,
      qrCodeUri,
      message: 'Scan this QR code with Google Authenticator or Authy'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### 1.4 Create 2FA Confirm Endpoint

**New File**: `src/app/api/auth/2fa/confirm/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TOTPService } from '@/services/totpService';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { secret, code } = await req.json();
    
    // Verify code matches secret
    const isValid = await TOTPService.verify2FACode(user.id, code);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }
    
    // Confirm 2FA
    await TOTPService.confirm2FA(user.id, secret, code);
    
    // Generate backup codes
    const backupCodes = await TOTPService.generateBackupCodes();
    
    return NextResponse.json({
      message: '2FA enabled successfully',
      backupCodes
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Part 2: Data Connector Integration

### 2.1 Create Connector Test Endpoint

**New File**: `src/app/api/connectors/test/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ConnectorService } from '@/services/connectorService';
import { encryptData } from '@/lib/encryption';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { type, config } = await req.json();
    
    // Encrypt sensitive credentials
    const encryptedConfig = {
      ...config,
      password: config.password ? encryptData(config.password) : undefined,
      apiKey: config.apiKey ? encryptData(config.apiKey) : undefined,
    };
    
    // Test connection
    const result = await ConnectorService.testConnector(config);
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### 2.2 Create Schema Discovery Endpoint

**New File**: `src/app/api/connectors/:id/schema/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ConnectorService } from '@/services/connectorService';
import { decryptData } from '@/lib/encryption';
import { authenticateRequest } from '@/lib/auth';
import { db } from '@/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(req);
    
    // Get connector config
    const connector = await db.query.connectors.findFirst({
      where: (c) => eq(c.id, params.id)
    });
    
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }
    
    // Decrypt config
    const config = JSON.parse(connector.configJson);
    if (config.password) config.password = decryptData(config.password);
    if (config.apiKey) config.apiKey = decryptData(config.apiKey);
    
    // Get schema
    const schemas = await ConnectorService.getConnectorSchemas(config);
    
    return NextResponse.json({ schemas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Part 3: Notebook Execution Integration

### 3.1 Execute Cell Endpoint

**New File**: `src/app/api/notebooks/:id/cells/:cellId/execute/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { NotebookService } from '@/services/notebookService';
import { DockerSandboxExecutor } from '@/services/dockerSandboxExecutor';
import { authenticateRequest } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; cellId: string } }
) {
  try {
    const user = await authenticateRequest(req);
    const { code, variables } = await req.json();
    
    // Execute in sandbox
    const sandbox = new DockerSandboxExecutor({
      maxMemoryMb: 512,
      maxTimeoutMs: 30000,
    });
    
    const result = await sandbox.executePython(code, variables);
    
    // Store result in database
    await NotebookService.executeCell({
      notebookId: params.id,
      cellIndex: parseInt(params.cellId),
      code,
      variables,
    });
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Part 4: Audit Logging Middleware

### 4.1 Create Global Audit Middleware

**New File**: `src/middleware/auditMiddleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/services/auditService';
import { authenticateRequest } from '@/lib/auth';

export async function auditMiddleware(req: NextRequest, res: NextResponse) {
  const user = await authenticateRequest(req);
  
  if (!user) return res;
  
  const startTime = Date.now();
  
  // Log after request is processed
  setImmediate(async () => {
    const duration = Date.now() - startTime;
    
    // Determine action from request
    const path = req.nextUrl.pathname;
    const method = req.method;
    const action = `${method.toLowerCase()}_${path.split('/').pop()}`;
    
    await AuditService.logAuditAction({
      userId: user.id,
      action,
      resourceType: 'api',
      resourceId: path,
      status: 'success',
      details: { method, path },
      ipAddress: AuditService.getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      duration,
    });
  });
  
  return res;
}
```

---

## Part 5: Environment Configuration

### 5.1 Required Environment Variables

Add to `.env.local`:

```
# Encryption
ENCRYPTION_KEY=<32-byte hex string or generate new>

# JWT
JWT_SECRET=<secure-random-string>

# 2FA
TOTP_ISSUER=Mastiff

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mastiff

# CSRF
CSRF_TOKEN_MAX_AGE=86400
```

### 5.2 Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Part 6: Database Migrations

### 6.1 Create Migration for New Columns

**New File**: `migrations/001_add_2fa_and_audit.sql`

```sql
-- Add 2FA columns to users table
ALTER TABLE users 
ADD COLUMN two_factor_secret VARCHAR(255),
ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  status VARCHAR(50),
  status_code INTEGER,
  details JSONB,
  error TEXT,
  ip_address INET,
  user_agent TEXT,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Create connectors table
CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  name VARCHAR(255),
  type VARCHAR(50),
  config_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_connectors_org ON connectors(organization_id);
```

### 6.2 Run Migrations

```bash
# Using Drizzle ORM
npm run migrate

# Or using raw SQL
psql $DATABASE_URL < migrations/001_add_2fa_and_audit.sql
```

---

## Part 7: Testing Integration

### 7.1 Test 2FA Flow

```bash
# Enable 2FA
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"

# Confirm 2FA with code
curl -X POST http://localhost:3000/api/auth/2fa/confirm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secret":"...", "code":"123456"}'
```

### 7.2 Test Connector

```bash
# Test PostgreSQL connector
curl -X POST http://localhost:3000/api/connectors/test \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "postgresql",
    "config": {
      "host": "localhost",
      "port": 5432,
      "database": "analytics",
      "username": "user",
      "password": "pass"
    }
  }'
```

### 7.3 Test Notebook Execution

```bash
# Execute cell
curl -X POST http://localhost:3000/api/notebooks/:id/cells/:cellId/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "print(\"Hello from sandbox\")",
    "variables": {}
  }'
```

---

## Part 8: Production Deployment Checklist

- [ ] Generate strong `ENCRYPTION_KEY` and store in secure vault
- [ ] Generate strong `JWT_SECRET` and store in secure vault
- [ ] Configure CORS to whitelist only your domains
- [ ] Enable rate limiting on auth endpoints
- [ ] Setup Docker daemon for sandboxed execution
- [ ] Configure backup codes storage for 2FA
- [ ] Setup monitoring for audit logs
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Configure Slack/PagerDuty for CI/CD notifications
- [ ] Setup database backups before deploying

---

## Part 9: Monitoring & Debugging

### 9.1 Check Audit Logs

```sql
SELECT * FROM audit_logs 
WHERE user_id = '<user-id>'
ORDER BY created_at DESC
LIMIT 20;
```

### 9.2 Check Docker Sandbox

```bash
# List running containers
docker ps

# Check container logs
docker logs <container-id>

# Remove stuck containers
docker rm -f <container-id>
```

### 9.3 Check Encryption

```typescript
import { encryptData, decryptData } from '@/lib/encryption';

const plaintext = 'secret-password';
const encrypted = encryptData(plaintext);
const decrypted = decryptData(encrypted);

console.log(plaintext === decrypted); // true
```

---

## Summary of Changes

| Component | Status | Location | Integration Point |
|-----------|--------|----------|-------------------|
| Encryption | ✅ Done | `src/lib/encryption.ts` | All credential storage |
| CSRF Protection | ✅ Done | `src/lib/csrf.ts` | All POST/PUT/DELETE routes |
| Audit Logging | ✅ Done | `src/services/auditService.ts` | All API routes |
| 2FA/TOTP | ✅ Done | `src/services/totpService.ts` | Auth login flow |
| Data Connectors | ✅ Done | `src/services/connectorService.ts` | Notebook data access |
| Docker Sandbox | ✅ Done | `src/services/dockerSandboxExecutor.ts` | Notebook cell execution |
| CI/CD Pipeline | ✅ Done | `.github/workflows/ci-cd.yml` | GitHub Actions |
