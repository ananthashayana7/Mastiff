# Security & Compliance Handbook

**Version**: 1.0  
**Status**: Baseline Requirements (Ready for Implementation)  
**Last Updated**: February 13, 2026

---

## 1. Security Overview

This handbook outlines security requirements for the Mastiff (Julius.ai-like) platform. It covers:
- Authentication & Authorization (Sec 2)
- Data Protection (Sec 3)
- Infrastructure Security (Sec 4)
- Compliance (Sec 5)
- Security Operations (Sec 6)
- Incident Response (Sec 7)

---

## 2. Authentication & Authorization

### 2.1 Password Security

#### Requirements
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, special chars
- No common patterns (123456, password, etc.)
- No reuse of last 5 passwords
- Force change every 90 days (optional, per policy)

#### Implementation
```typescript
// src/services/validation.ts
export const validatePassword = (pwd: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (pwd.length < 12) errors.push("Min 12 chars");
  if (!/[A-Z]/.test(pwd)) errors.push("Need uppercase");
  if (!/[a-z]/.test(pwd)) errors.push("Need lowercase");
  if (!/\d/.test(pwd)) errors.push("Need number");
  if (!/[!@#$%^&*]/.test(pwd)) errors.push("Need special char");
  
  const commonPatterns = ['password', '123456', 'qwerty'];
  if (commonPatterns.some(p => pwd.toLowerCase().includes(p))) 
    errors.push("Too common");
  
  return { valid: errors.length === 0, errors };
};

// Hashing: bcrypt with 10+ rounds
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash(password, 10);
```

### 2.2 Multi-Factor Authentication (2FA)

#### TOTP Implementation
```typescript
// src/services/auth2fa.ts
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class Auth2FAService {
  // Generate secret for new 2FA enrollment
  async generateSecret(userId: string) {
    const secret = speakeasy.generateSecret({
      name: `Mastiff (${userId})`,
      issuer: 'Mastiff',
      length: 32
    });
    
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    
    return { secret: secret.base32, qrCode, backupCodes: this.generateBackupCodes() };
  }
  
  // Verify TOTP token during login
  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow ±2 time windows (60s tolerance)
    });
  }
  
  // Generate backup codes for account recovery
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Array(8).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join(''));
    }
    return codes;
  }
}
```

#### Login Flow with 2FA
```
POST /api/auth/login
  ├─ Validate email + password
  ├─ If 2FA enabled:
  │  ├─ Generate time-limited session token
  │  ├─ Send TOTP challenge
  │  └─ Return with status: "2fa_required"
  │
  └─ User submits TOTP token
     └─ POST /api/auth/2fa/verify
        ├─ Validate TOTP
        ├─ Generate JWT + refresh token
        └─ Return with status: "authenticated"

Session timeout: 15 minutes (with refresh)
Inactive logout: 30 minutes
```

### 2.3 JWT Token Strategy

```typescript
// src/services/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

export class JWTService {
  // Access token (short-lived, 15 min)
  generateAccessToken(userId: string, email: string) {
    return jwt.sign(
      { userId, email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );
  }
  
  // Refresh token (long-lived, 7 days, rotates on use)
  generateRefreshToken(userId: string) {
    const token = jwt.sign(
      { userId, type: 'refresh', jti: crypto.randomUUID() },
      REFRESH_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );
    
    // Store jti in DB to allow invalidation
    // Store in Redis for faster revocation lookups
    return token;
  }
  
  // Verify and refresh
  async refreshAccessToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
      
      // Check if jti is in revocation list
      const isRevoked = await redis.get(`revoked:${decoded.jti}`);
      if (isRevoked) throw new Error("Token revoked");
      
      // Generate new access token + new refresh token (rotate)
      return {
        accessToken: this.generateAccessToken(decoded.userId, decoded.email),
        refreshToken: this.generateRefreshToken(decoded.userId)
      };
    } catch (err) {
      throw new Error("Invalid refresh token");
    }
  }
}
```

### 2.4 Session Management

```typescript
// src/middleware/sessionAuth.ts
import { NextRequest, NextResponse } from 'next/server';

export async function authMiddleware(req: NextRequest) {
  const token = req.headers.get('authorization')?.split(' ')[1];
  
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check session in DB
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token)
    });
    
    if (!session || new Date() > session.expiresAt) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    
    // Update last activity
    await db.update(sessions)
      .set({ lastActivity: new Date() })
      .where(eq(sessions.id, session.id));
    
    // Attach user to request
    (req as any).user = { userId: decoded.userId, sessionId: session.id };
    return undefined; // Continue
  } catch (err) {
    return NextResponse.json({ error: 'Token invalid' }, { status: 401 });
  }
}
```

---

## 3. Data Protection

### 3.1 Encryption at Rest

#### Sensitive Fields (Database)
```typescript
// src/services/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

export class EncryptionService {
  // Encrypt sensitive data (credentials, API keys)
  encrypt(plaintext: string): { iv: string; encrypted: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      encrypted
    };
  }
  
  // Decrypt when needed
  decrypt(iv: string, encrypted: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Usage in schema
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  type: varchar("type"), // 'google_sheets', 'snowflake', etc.
  name: varchar("name"),
  credentials: jsonb("credentials"), // { iv, encrypted } format
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

#### Key Management
```
Generate encryption key:
  $ openssl rand -hex 32
  
Store in:
  - .env.local (development)
  - AWS Secrets Manager (production)
  - HashiCorp Vault (enterprise)
  
Key rotation strategy:
  - Rotate every 90 days
  - Keep previous 2 keys for gradual decryption
  - Re-encrypt on major updates
```

### 3.2 Password Hashing

```typescript
// Use bcrypt, NOT plaintext storage
import bcrypt from 'bcryptjs';

// During signup
const hash = await bcrypt.hash(password, 10); // 10 rounds = ~100ms
await db.insert(users).values({ ...user, passwordHash: hash });

// During login
const user = await db.query.users.findFirst({ where: eq(users.email, email) });
const isValid = await bcrypt.compare(password, user.passwordHash);

// Never log passwords or include in responses
```

### 3.3 Data Classification & Handling

```
PUBLIC:
  • App logos, documentation
  • No restrictions

INTERNAL:
  • Architecture docs, design decisions
  • Access: Team members only

CONFIDENTIAL:
  • User emails, hashed passwords
  • DB credentials, API keys
  • Access: Authorized systems only
  • Encryption: Required at rest & in transit
  • Retention: Minimum necessary

HIGHLY CONFIDENTIAL:
  • API keys, encryption keys
  • Access: Production systems only (no staging)
  • Encryption: Always encrypted
  • Audit: Every access logged
  • Rotation: Quarterly
```

### 3.4 Data Retention & Deletion

```
User Data Lifecycle:

Active Account:
  • Store indefinitely
  • Searchable, accessible
  • Backed up daily

Inactive Account (2 years no login):
  • Send notification
  • Option to reactivate

Deleted Account (User requests):
  • Delete within 30 days
  • Irreversible
  • Audit trail retained (anonymized)
  
Query Results:
  • Ephemeral (auto-delete after 48h)
  • No backup of results
  • Metadata retained

Audit Logs:
  • Retain 7 years (compliance)
  • Immutable (write-once)
  • Monthly archival to cold storage
```

---

## 4. Infrastructure Security

### 4.1 Network Security

#### TLS/SSL Configuration
```
Requirements:
  • TLS 1.2 minimum (1.3 preferred)
  • Cipher suites: Only strong algorithms
  • HSTS: 1 year preload
  • Certificate: Wildcard or multi-SAN
  • Renewal: 60 days before expiry

Nginx config (reverse proxy):
  server {
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
  }
```

#### CORS Policy
```typescript
// src/middleware/cors.ts
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
}));
```

#### CSRF Protection
```typescript
// src/middleware/csrf.ts
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: false }); // Use sessions, not cookies

// Generate token on GET requests
app.get('/api/form', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Validate on POST/PUT/DELETE
app.post('/api/submit', csrfProtection, (req, res) => {
  if (!req.csrfToken()) return res.status(403).send('CSRF invalid');
  // Process
});

// Frontend: Include token in all requests
<form method="POST">
  <input type="hidden" name="_csrf" value="{csrfToken}" />
</form>
```

### 4.2 Rate Limiting

```typescript
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate_limit:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  handler: (req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});

app.use('/api/', limiter);

// Stricter limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts
  skipSuccessfulRequests: true // Don't count successful logins
});

app.post('/api/auth/login', authLimiter, ...);
```

### 4.3 Input Validation & Sanitization

```typescript
// src/services/validation.ts
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';

// Zod schemas for type-safe validation
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export const ChatQuerySchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  mode: z.enum(['chat', 'analysis']).default('analysis'),
});

// Middleware to validate request bodies
export const validateBody = (schema: z.ZodSchema) => 
  (req: NextRequest) => {
    try {
      return schema.parse(req.body);
    } catch (err) {
      throw new GraphQLError('Validation failed', {
        extensions: { code: 'VALIDATION_ERROR', details: err.issues }
      });
    }
  };

// Sanitize HTML to prevent XSS
export const sanitizeContent = (content: string): string => {
  return sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'code', 'pre'],
    allowedAttributes: {}
  });
};

// API Usage
POST /api/chat
  Body: ChatQuerySchema validated
  Content sanitized before storage
```

### 4.4 Code Execution Sandbox Security

```dockerfile
# docker/sandbox.Dockerfile
FROM python:3.12-slim

# Install only necessary packages (minimize attack surface)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages (pin versions for reproducibility)
COPY requirements-sandbox.txt .
RUN pip install --no-cache-dir -r requirements-sandbox.txt

# Security: Run as non-root user (UID 1000)
RUN useradd -m -u 1000 sandbox
USER sandbox

# No shell for interactive access
ENTRYPOINT ["/usr/bin/python3"]
CMD ["-u", "-c"]

# Disable network
WORKDIR /sandbox
```

**Container Execution Policy**:
```
Memory Limits: 512MB - 2GB per execution
CPU Limits: 1 core
Timeout: 30 seconds
Network: Disabled
Host Access: None
Filesystem: Read-only mounted data, write-only output

Code Restrictions:
  FORBIDDEN_MODULES = ['os', 'subprocess', 'sys', 'socket', 'shutil']
  FORBIDDEN_FUNCTIONS = ['eval', 'exec', 'compile', 'open', 'input', '__import__']
  
Validation:
  • Parse code as AST
  • Check imports against blacklist
  • Inspect function calls
  • Reject if unsafe patterns detected
```

---

## 5. Compliance & Governance

### 5.1 Data Privacy (GDPR, Privacy Laws)

#### User Rights Implementation
```typescript
// POST /api/privacy/export-data
// User requests all personal data

export async function exportUserData(userId: string) {
  // Collect all user data
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const sessionIds = await db.query.sessions.findMany({ where: eq(sessions.userId, userId) });
  const files = await db.query.files.findMany({ where: eq(files.userId, userId) });
  const messages = flatten(sessionIds.map(s => s.messages));
  const apiKeys = await db.query.apiKeys.findMany({ where: eq(apiKeys.userId, userId) });
  
  // Format as JSON/CSV
  const export_data = { user, sessions, files, messages, apiKeys };
  
  // Return as downloadable file
  return new Response(JSON.stringify(export_data), {
    headers: { 'Content-Disposition': 'attachment; filename=my_data.json' }
  });
}

// POST /api/privacy/delete-account
// Permanent deletion request (7-day cool-off)

export async function requestAccountDeletion(userId: string) {
  // Set deletion flag + expiry
  const deletionRequest = await db.insert(deletionRequests).values({
    userId,
    requestedAt: new Date(),
    deletesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  
  // Send confirmation email (user can cancel)
  await sendEmail({
    to: user.email,
    subject: 'Account Deletion Requested',
    body: `Your account will be deleted in 7 days. Click here to cancel: ${cancelLink}`
  });
  
  // Cron job: Delete after 7 days
  // (anonymize audit logs, delete all user data)
}
```

#### Privacy Policy Requirements
```
Mastiff Privacy Policy must document:

1. Data Collection
   • What data collected
   • How it's used
   • Legal basis (consent, contract, legitimate interest)
   
2. Data Retention
   • How long stored
   • Deletion timeline
   • Backup retention

3. User Rights
   • Access (export data)
   • Rectification (update data)
   • Deletion (right to be forgotten)
   • Portability
   • Opt-out (marketing)

4. Third Parties
   • Data processors/subprocessors
   • Data sharing practices
   • International transfers (if applicable)

5. Security
   • Encryption practices
   • Access controls
   • Breach notification process

6. Contact
   • Data Protection Officer
   • Privacy inquiries email
```

### 5.2 SOC 2 Type II Readiness

#### Security Pillar Checklist

**CC (Common Criteria)**:
- [x] CC6.1: Logical access controls
  - Implement: User authentication (2FA), RBAC
- [x] CC6.2: Prior to issuing system credentials
  - Implement: Password policy validation, secure reset flow
- [x] CC7.1: System monitoring
  - Implement: Sentry, CloudWatch, audit logs

**A1 (Availability)**:
- [x] A1.1: Physical & logical access controls
  - Implement: AWS security groups, VPC
- [x] A1.2: Redundancy & recovery
  - Implement: Multi-AZ RDS, automated backups

**C1 (Confidentiality)**:
- [x] C1.1: Data encryption in transit
  - Implement: TLS 1.3, HSTS
- [x] C1.2: Data encryption at rest
  - Implement: AES-256 encryption, encrypted credentials

**PI (Privacy)**:
- [x] PI1.1: Purpose of data collection stated
  - Implement: Privacy policy, consent forms
- [x] PI2.1: Data access restricted
  - Implement: RBAC, audit logs

#### Audit Evidence Storage
```
Evidence collected monthly:
  • System access logs (Cloudtrail)
  • User authentication logs (failed logins, 2FA usage)
  • Database change logs (DDL/DML audits)
  • Backup verification reports
  • Security incident logs (none if systems secure)
  • Penetration test results
  
Stored in:
  • S3 bucket (immutable versioning)
  • Replicated to second region
  • Retention: 2+ years
```

### 5.3 PCI-DSS (If Handling Payments)

**Recommendation**: Use Stripe/Square, never store card data locally

```
If integrating payment gateway:
  • Network: PCI-compliant third party (Stripe)
  • Data: No CC numbers in database
  • Logging: Log payment attempts, not cards
  • Testing: Annual security scans
  
Implementation:
  ✓ Stripe Elements (card tokenization)
  ✓ Stripe webhooks (payment confirmations)
  ✗ Never store card data
  ✗ Never log card numbers
```

---

## 6. Security Operations

### 6.1 Vulnerability Management

#### Dependency Scanning
```bash
# Weekly scans
npm audit
npm audit fix

# Automated via GitHub Dependabot
# (enabled in repository settings)

# Output: Auto-create PRs for security updates
```

#### Code Security Scanning
```bash
# Pre-commit hook
#!/bin/bash
# Check for secrets
truffleHog --regex

# Lint security issues
eslint --plugin security

# Type check
tsc --noEmit
```

#### Penetration Testing
```
Annual schedule:
  • OWASP Top 10 assessment
  • API security testing
  • Access control validation
  • Data flow analysis
  
Quarterly internal scans:
  • Automated SAST (SonarQube)
  • DAST (ZAP scanning)
  • Dependency check (npm audit)
```

### 6.2 Incident Response Plan

#### Security Incident Classification
```
Severity Levels:

CRITICAL (P0):
  • Confirmed data breach affecting 1000+ users
  • Active exploit in production
  • Account takeover widespread
  • Response time: 15 minutes
  • Escalation: CEO, Legal, PR

HIGH (P1):
  • Vulnerability in production (no exploit yet)
  • Isolated account breach (< 100 users)
  • DDoS attack ongoing
  • Response time: 1 hour
  • Escalation: VP Eng + Security

MEDIUM (P2):
  • Vulnerability in staging
  • Isolated infrastructure failure
  • Employee credential compromise
  • Response time: 4 hours

LOW (P3):
  • Vulnerable dependency (no fix available)
  • Non-sensitive data exposure
  • Policy violation (minor)
  • Response time: 1 week
```

#### Incident Response Workflow
```
1. DETECT: Alert from Sentry/CloudWatch/Manual report

2. VERIFY: Confirm incident
   • Reproduce if possible
   • Check logs for scope
   • Identify affected users/data

3. CONTAIN: Stop the bleeding
   • Revoke compromised credentials
   • Disable malicious accounts
   • Take service offline if necessary
   • Activate backup systems

4. ERADICATE: Remove root cause
   • Patch vulnerability
   • Close access vectors
   • Clean infected systems

5. RECOVER: Restore normal operations
   • Restore from backup if needed
   • Bring systems back online
   • Verify functionality

6. POST-MORTEM: Lessons learned
   • Document timeline
   • Root cause analysis
   • Prevention measures
   • Training updates

Notification:
  • User email (if data exposed)
  • Legal review before sending
  • Regulatory notification (if required)
  • Internal comms (team update)
```

---

## 7. Security Checklist for Deployment

### Before Launching to Production

**Authentication & Authorization**
- [ ] 2FA implemented and tested
- [ ] JWT token generation & refresh working
- [ ] Password hashing (bcrypt 10+ rounds)
- [ ] Session management in Redis
- [ ] CSRF tokens on all state-changing endpoints
- [ ] RBAC middleware enforcing roles
- [ ] Rate limiting enabled

**Data Protection**
- [ ] Credentials encrypted at rest (AES-256)
- [ ] HTTPS/TLS 1.3 configured
- [ ] HSTS headers enabled
- [ ] Data retention policy documented
- [ ] Backup encryption enabled
- [ ] Database password changed from default

**Infrastructure**
- [ ] Security groups restrict unnecessary ports
- [ ] VPC isolates database from public internet
- [ ] Database accessible only from app servers
- [ ] No hardcoded secrets (all in env vars)
- [ ] SSH keys rotated
- [ ] Firewall rules documented

**Code & Dependencies**
- [ ] No console logs of sensitive data
- [ ] npm audit passes (no high/critical vulns)
- [ ] Input validation on all endpoints
- [ ] HTML sanitization enabled
- [ ] SQL injection protection (via ORM)

**Monitoring & Logging**
- [ ] Sentry configured for error tracking
- [ ] CloudWatch logging enabled
- [ ] Audit logs flowing to database
- [ ] Alerts for suspicious activities
- [ ] Log rotation configured

**Compliance**
- [ ] Privacy policy published
- [ ] Terms of Service published
- [ ] GDPR data export endpoint working
- [ ] Data deletion working (7-day cool-off)
- [ ] Incident response plan documented

**Testing**
- [ ] Security tests in CI/CD (OWASP checks)
- [ ] Penetration testing completed
- [ ] Load testing under DDoS simulation
- [ ] Backup restore tested
- [ ] Failover procedures documented

---

## 8. Security Contact & Reporting

**Report security vulnerabilities to:** security@mastiff.ai

**Responsible Disclosure Policy**:
```
1. Report via security@mastiff.ai (not public issue tracker)
2. Include: Description, reproduction steps, impact
3. We will: Acknowledge within 24h, provide timeline
4. Timeline: 90 days for patch + release
5. Recognition: Credit in security advisory (opt-in)
6. Rewards: Bug bounty program (Phase 2+)
```

---

## 9. Continuous Security Improvement

### Quarterly Reviews
- [ ] Audit logs review (look for anomalies)
- [ ] Access control review (who has what access?)
- [ ] Dependency updates (security patches)
- [ ] Encryption key rotation
- [ ] Incident review (were there any?)

### Annual Activities
- [ ] Penetration testing
- [ ] SOC 2 audit
- [ ] GDPR compliance review
- [ ] Security training for team
- [ ] Incident response drill

### Monthly
- [ ] npm audit for new vulnerabilities
- [ ] Review GitHub security alerts
- [ ] Monitor Sentry for error patterns
- [ ] Backup integrity checks

---

**Document Owner**: Security Team  
**Last Updated**: February 13, 2026  
**Next Review**: May 2026

---

## Appendix: Quick Reference

### Environment Variables (Required for Production)
```
# Authentication
JWT_SECRET=<random-64-char-string>
REFRESH_SECRET=<random-64-char-string>
ENCRYPTION_KEY=<32-byte-hex-string>

# Database
DATABASE_URL=postgresql://user:pass@host:5432/mastiff

# Cache
REDIS_URL=redis://host:6379

# API Keys
GEMINI_API_KEY=<api-key>
STRIPE_SECRET_KEY=<key> (if using payments)

# Email
SENDGRID_API_KEY=<key>

# Monitoring
SENTRY_DSN=<dsn>

# AWS (if deployed)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

### Useful Security Commands
```bash
# Generate encryption key
openssl rand -hex 32

# Generate JWT secrets
openssl rand -hex 32

# Check for secrets in git history
truffleHog filesystem / --regex

# Audit npm dependencies
npm audit --production

# OWASP dependency check
npx snyk test

# SSL certificate test
openssl s_client -connect mastiff.ai:443 -tls1_3
```

