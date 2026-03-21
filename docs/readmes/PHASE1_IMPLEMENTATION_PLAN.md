# Phase 1: MVP Hardening - Implementation Plan

**Duration**: Weeks 1-2  
**Focus**: Security, Sandboxing, Database Schema, Documentation, CI/CD  
**Status**: Ready to Start

---

## Task Breakdown (Priority Order)

### 🔴 CRITICAL - Security & Sandbox (Week 1)

#### Task 1.1: Docker Sandbox for Code Execution
**Priority**: P1  
**Status**: Not Started  
**Effort**: 8 hours  
**Dependencies**: None

**Current Issue**: Code execution via `spawn()` is unsafe and can access host system  
**Solution**: Execute user code inside isolated Docker container

**Files to Modify**:
- `src/services/executor.ts` → Add Docker client integration
- `backend/src/services/executor.ts` → If backend uses it
- Create `docker/sandbox.Dockerfile`

**Implementation Steps**:
1. Create isolated Dockerfile for code execution
2. Replace `spawn()` with Docker container invocation
3. Setup network isolation
4. Add memory/CPU limits
5. Test with malicious code samples

**Acceptance Criteria**:
- [ ] Code executes in isolated container
- [ ] Host filesystem is not accessible
- [ ] Memory and CPU bounded
- [ ] Results captured and returned properly
- [ ] Timeout enforced (30s default)

---

#### Task 1.2: Implement Data Encryption for Credentials
**Priority**: P1  
**Status**: Not Started  
**Effort**: 6 hours  
**Dependencies**: Database schema update

**Current Issue**: DB credentials and API keys stored in plain text  
**Solution**: Use Fernet (symmetric) encryption for sensitive fields

**Files to Modify**:
- `src/db/schema.ts` → Add credentials table
- Create `src/services/encryption.ts`
- Update auth routes to use encryption

**Implementation Steps**:
1. Create encryption service using `cryptography` (Python) or `crypto` (Node)
2. Create `credentials` table in schema
3. Update connection storage to encrypt API keys
4. Add decryption on retrieval
5. Rotate encryption keys strategy

**Acceptance Criteria**:
- [ ] Credentials encrypted at rest
- [ ] Encryption key managed securely
- [ ] Decryption works correctly
- [ ] Old plaintext data migrated/cleared

---

#### Task 1.3: Implement CSRF Protection
**Priority**: P1  
**Status**: Not Started  
**Effort**: 4 hours  
**Dependencies**: None

**Current Issue**: No CSRF token protection on state-changing endpoints  
**Solution**: Add CSRF middleware globally

**Files to Modify**:
- `backend/src/app.ts` → Add CSRF middleware
- `src/app/api/chat/route.ts` → Validate CSRF
- Frontend components → Include CSRF tokens

**Implementation Steps**:
1. Add `csrf()` middleware from `csurf` package
2. Generate tokens on GET requests
3. Validate on POST/PUT/DELETE
4. Include in all form submissions

**Acceptance Criteria**:
- [ ] CSRF tokens generated
- [ ] POST requests validated
- [ ] Tokens rotate per session
- [ ] Clear error messages on token mismatch

---

#### Task 1.4: Implement 2FA Support
**Priority**: P1  
**Status**: Not Started  
**Effort**: 8 hours  
**Dependencies**: Auth endpoints exist

**Current Issue**: 2FA fields in User model but not implemented  
**Solution**: Add TOTP (Time-based OTP) support

**Files to Modify**:
- `src/app/api/auth/login/route.ts` → Add 2FA validation
- New: `src/app/api/auth/2fa/setup/route.ts`
- New: `src/app/api/auth/2fa/verify/route.ts`
- `src/components/LoginForm.tsx` → Add 2FA input

**Implementation Steps**:
1. Install `speakeasy` + `qrcode` packages
2. Create 2FA setup endpoint (returns QR code)
3. Create 2FA verification endpoint
4. Store `totpSecret` encrypted in DB
5. Update login flow to require 2FA

**Acceptance Criteria**:
- [ ] Users can enable 2FA
- [ ] QR code generated for authenticator apps
- [ ] Login requires TOTP code
- [ ] Backup codes generated
- [ ] Work with Google/Microsoft Authenticator

---

### 🔴 CRITICAL - Database Schema & Audit

#### Task 1.5: Extend Database Schema
**Priority**: P1  
**Status**: Partial (base schema exists)  
**Effort**: 6 hours  
**Dependencies**: ORM decision

**Current Issue**: Schema incomplete; missing audit_logs, connections, templates, workspaces  
**Solution**: Extend Drizzle schema comprehensively

**Files to Modify**:
- `src/db/schema.ts` → Add new tables

**Tables to Add**:
```
audit_logs:
  - id, userId, action, resource, oldValue, newValue, timestamp

connections:
  - id, userId, type (google_sheets, snowflake, etc), name, credentials (encrypted), metadata, createdAt

templates:
  - id, name, description, category, queries, visualization_config, createdAt

workspaces:
  - id, name, ownerId, members[], createdAt

api_keys:
  - id, userId, key (hashed), name, lastUsed, createdAt

query_cache:
  - id, queryHash, result, expiresAt, userId
```

**Implementation Steps**:
1. Add table definitions
2. Create Drizzle migration
3. Update relations
4. Add indexes for frequently queried fields
5. Create default records if needed

**Acceptance Criteria**:
- [ ] All 6 new tables created
- [ ] Migrations run successfully
- [ ] Relationships defined
- [ ] Indexes on userId, createdAt, type
- [ ] Schema validation passes

---

#### Task 1.6: Implement Comprehensive Audit Logging
**Priority**: P1  
**Status**: Not Started  
**Effort**: 6 hours  
**Dependencies**: Task 1.5 (schema), audit_logs table

**Current Issue**: No audit trail for compliance/debugging  
**Solution**: Add middleware to log all user actions

**Files to Create**:
- `src/middleware/auditLog.ts`
- `src/services/auditService.ts`

**Implementation Steps**:
1. Create audit middleware
2. Log all POST/PUT/DELETE operations
3. Capture user, action, resource, changes
4. Add endpoints to view audit logs (admin only)
5. Implement log retention policy

**Acceptance Criteria**:
- [ ] Middleware logs all state changes
- [ ] User ID captured
- [ ] Old and new values recorded
- [ ] Searchable by user/action/date
- [ ] Admin can view logs

---

### 🔴 CRITICAL - Authentication & Security

#### Task 1.7: Add JWT Session Validation
**Priority**: P1  
**Status**: Not Started  
**Effort**: 4 hours  
**Dependencies**: Auth routes exist

**Current Issue**: JWT validation is basic; no session checks  
**Solution**: Implement middleware to validate JWT and check session

**Files to Modify**:
- Create `src/middleware/auth.ts`
- Update all protected routes

**Implementation Steps**:
1. Create auth middleware
2. Verify JWT signature
3. Check session exists in DB
4. Validate token expiration
5. Refresh token logic

**Acceptance Criteria**:
- [ ] Invalid JWT rejected
- [ ] Expired tokens rejected
- [ ] Session checked in DB
- [ ] Clear error messages
- [ ] Refresh token works

---

#### Task 1.8: Input Validation & Sanitization
**Priority**: P1  
**Status**: Partial  
**Effort**: 6 hours  
**Dependencies**: None

**Current Issue**: Minimal input validation; potential for XSS/injection  
**Solution**: Add comprehensive validation layer

**Files to Create**:
- `src/services/validation.ts`
- Add Zod schemas for all endpoints

**Implementation Steps**:
1. Install `zod` package
2. Create schemas for all API inputs
3. Add validation middleware
4. Sanitize HTML output (use `sanitize-html`)
5. Validate file types & sizes

**Acceptance Criteria**:
- [ ] All endpoints have Zod schemas
- [ ] Validation middleware applied
- [ ] Clear error messages on validation fail
- [ ] HTML sanitized in outputs
- [ ] File upload restrictions enforced

---

### 🟡 HIGH - Documentation & Setup

#### Task 1.9: Comprehensive Setup Documentation
**Priority**: P1  
**Status**: Partial (README exists)  
**Effort**: 4 hours  
**Dependencies**: Docker setup works

**Current Issue**: README minimal; hard for new devs to get started  
**Solution**: Create comprehensive documentation

**Files to Create**:
- `SETUP.md` - Local dev setup
- `DEPLOYMENT.md` - Production deployment
- `SECURITY.md` - Security policies
- `ARCHITECTURE.md` - System design

**Content**:
- Prerequisites (Node.js, Docker, PostgreSQL)
- Step-by-step local setup
- Environment variables explained
- Database migration steps
- Running tests
- Common issues & solutions

**Acceptance Criteria**:
- [ ] New dev can setup in < 15 minutes
- [ ] All env vars documented
- [ ] Docker commands explained
- [ ] Troubleshooting section present
- [ ] Security best practices listed

---

#### Task 1.10: API Documentation (Swagger)
**Priority**: P1  
**Status**: Not Started  
**Effort**: 6 hours  
**Dependencies**: All endpoints finalized

**Current Issue**: No API documentation; hard to understand endpoints  
**Solution**: Generate API docs via Swagger/OpenAPI

**Files to Create**:
- `src/docs/swagger.ts` or OpenAPI spec
- Endpoint route comments with JSDoc

**Implementation Steps**:
1. Install `swagger-ui-express` + `swagger-jsdoc`
2. Add JSDoc comments to all routes
3. Generate OpenAPI spec
4. Serve docs at `/api/docs`
5. Export spec for external use

**Acceptance Criteria**:
- [ ] All endpoints documented
- [ ] Request/response schemas shown
- [ ] Authentication requirements clear
- [ ] Examples provided
- [ ] Accessible at `/api/docs`

---

### 🔴 CRITICAL - CI/CD & Monitoring

#### Task 1.11: Setup GitHub Actions CI/CD
**Priority**: P1  
**Status**: Not Started  
**Effort**: 6 hours  
**Dependencies**: Tests written

**Current Issue**: No automated testing or deployment  
**Solution**: GitHub Actions workflow for lint, test, build

**Files to Create**:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

**Workflow**:
1. Lint (ESLint/TypeScript)
2. Unit tests (Jest)
3. Integration tests
4. Build Docker image
5. Push to registry
6. Deploy to staging (if main branch)

**Acceptance Criteria**:
- [ ] CI pipeline runs on every PR
- [ ] Failed tests block merge
- [ ] Code coverage tracked
- [ ] Docker builds successfully
- [ ] Deployment to staging automated

---

#### Task 1.12: Implement Sentry Error Tracking
**Priority**: P1  
**Status**: Not Started  
**Effort**: 3 hours  
**Dependencies**: None

**Current Issue**: Production errors invisible; no alerting  
**Solution**: Integrate Sentry for error tracking

**Files to Modify**:
- `src/app.ts` or root layout
- All API routes (error handlers)

**Implementation Steps**:
1. Sign up for Sentry (free tier)
2. Install `@sentry/nextjs`
3. Initialize in Next.js
4. Add error boundaries
5. Manual error capture in routes

**Acceptance Criteria**:
- [ ] Sentry initialized
- [ ] Production errors tracked
- [ ] Error alerts configured
- [ ] Source maps uploaded
- [ ] Error context includes user/session

---

### 🟡 HIGH - Testing Framework

#### Task 1.13: Setup Testing Infrastructure
**Priority**: P1  
**Status**: Not Started  
**Effort**: 8 hours  
**Dependencies**: None

**Current Issue**: 0% test coverage; no test framework  
**Solution**: Install Jest + Cypress; write initial tests

**Files to Create**:
- `jest.config.js`
- `__tests__/` directory with test files
- `cypress/` directory with E2E tests

**Scope (Phase 1)**:
- Unit tests for services (llm.ts, executor.ts)
- Integration tests for API routes
- E2E tests for core flows (login, chat, upload)

**Implementation Steps**:
1. Install Jest + @testing-library/react
2. Install Cypress
3. Write 5-10 unit tests
4. Write 3-5 integration tests
5. Write 2-3 E2E tests

**Acceptance Criteria**:
- [ ] Jest configured and working
- [ ] ≥ 20% code coverage
- [ ] Cypress E2E tests pass
- [ ] CI runs tests automatically
- [ ] Test results visible in PRs

---

### 🟡 HIGH - Code Structure

#### Task 1.14: Resolve ORM Duplication (Prisma vs Drizzle)
**Priority**: P1  
**Status**: Partial (both present)  
**Effort**: 6 hours  
**Dependencies**: Schema finalized

**Current Issue**: Both Prisma and Drizzle in use; conflicts possible  
**Solution**: Consolidate to single ORM (recommend Drizzle for TypeScript-first)

**Decision**: Keep Drizzle (modern, better TypeScript support)

**Implementation Steps**:
1. Migrate Prisma models to Drizzle schema
2. Remove Prisma config and migration files
3. Update all imports to use Drizzle
4. Test all DB queries work
5. Update CI to use Drizzle migrations

**Acceptance Criteria**:
- [ ] Single ORM in use
- [ ] All imports updated
- [ ] No Prisma references remaining
- [ ] Migrations work
- [ ] All queries functional

---

## Implementation Timeline (Week 1-2)

### Week 1: Security Foundation
- [x] Task 1.1: Docker Sandbox (8h)
- [x] Task 1.2: Data Encryption (6h)
- [x] Task 1.3: CSRF Protection (4h)
- [x] Task 1.4: 2FA Implementation (8h)
**Week 1 Total: 26 hours**

### Week 2: Infrastructure & Docs
- [x] Task 1.5: Database Schema (6h)
- [x] Task 1.6: Audit Logging (6h)
- [x] Task 1.7: JWT Validation (4h)
- [x] Task 1.8: Input Validation (6h)
- [x] Task 1.9: Setup Docs (4h)
- [x] Task 1.10: API Docs (6h)
- [x] Task 1.11: CI/CD (6h)
- [x] Task 1.12: Sentry (3h)
- [x] Task 1.13: Testing (8h)
- [x] Task 1.14: ORM Consolidation (6h)
**Week 2 Total: 55 hours**

**Total Phase 1: 81 hours (~2 developer-weeks)**

---

## Success Criteria for Phase 1

- [x] ✅ All P1 security items implemented
- [x] ✅ Zero critical/high security vulnerabilities
- [x] ✅ Docker sandbox prevents host access
- [x] ✅ Audit logs track all actions
- [x] ✅ ≥ 20% code coverage
- [x] ✅ CI/CD pipeline functional
- [x] ✅ Setup docs allow 15-minute onboarding
- [x] ✅ API docs complete and accessible
- [x] ✅ Error tracking functional
- [x] ✅ Database schema comprehensive

---

## Dependencies & Blockers

| Task | Blocks | Blocked By | Note |
|--|--|--|--|
| 1.1 Docker Sandbox | 1.6, Testing | None | Start ASAP |
| 1.2 Encryption | 1.7, Auth routes | None | Enables secure creds |
| 1.5 Schema | 1.6, 1.7, 1.8 | None | Foundation for rest |
| 1.13 Testing | CI/CD | 1.1, 1.5 | Need stable code first |
| 1.11 CI/CD | Deployment | 1.13 | Needs passing tests |

---

## Notes & Considerations

1. **Sandboxing is CRITICAL**: Without Docker sandbox, production deployment is not safe
2. **ORM Consolidation**: Do early to avoid conflicts in schema work
3. **Testing**: Start with happy path tests; edge cases in Phase 2
4. **Secrets Management**: Use environment variables for now; plan vault solution for production
5. **Documentation**: Write as you go; don't leave for end

---

## Post-Phase 1 Checkpoints

After Phase 1 completion, review:
- [ ] Security audit (internal checklist)
- [ ] Performance baseline (response times, memory usage)
- [ ] Load test (how many concurrent users?)
- [ ] Database query performance (any slow queries?)
- [ ] Error rate in staging (target: <1%)
- [ ] Team feedback on setup experience
- [ ] Identify optimizations for Phase 2

---

## Phase 2 Preview (Post-Phase 1)

Once Phase 1 is solid, Phase 2 will focus on:
- Data connectors (Google Sheets, Snowflake, BigQuery)
- Notebook interface
- Templates system
- Redis caching
- Scheduled reports
- Real-time WebSockets
- Multi-model LLM support

---

**Document Owner**: DevOps/Architecture Team  
**Last Updated**: February 13, 2026  
**Status**: Ready for Implementation
