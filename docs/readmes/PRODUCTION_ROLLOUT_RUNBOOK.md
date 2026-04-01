# Production Rollout Runbook

Operational guide for deploying, monitoring, and maintaining Mastiff in production.

---

## 1. Pre-Deploy Checklist

- [ ] All CI checks pass on the release branch (`lint`, `type-check`, `test`, `build`).
- [ ] `npm audit` shows no critical/high vulnerabilities.
- [ ] `.env.production` has all required vars set (see `.env.example`).
- [ ] Database migrations are reviewed and tested against a staging copy.
- [ ] API keys (Gemini, SharePoint) are valid and not near quota.
- [ ] Encryption key (`ENCRYPTION_KEY`) is 64-hex-char and backed up securely.
- [ ] `JWT_SECRET` and `NEXTAUTH_SECRET` are unique, random, 32+ chars.
- [ ] Python 3.10+ is available on the host (`python3 --version`).
- [ ] Required Python packages installed: `pandas numpy plotly openpyxl`.
- [ ] `uploads/` directory exists with write permissions.
- [ ] Docker image builds successfully: `docker build -t mastiff .`

---

## 2. Staging Validation Checklist

```bash
# Deploy to staging
git checkout develop && git pull
npm ci && npm run build
npm run migrate
pm2 restart mastiff-app

# Run smoke checks
npm run smoke:api -- https://staging.mastiff.app

# Manual checks
# 1. Open staging URL in browser - login page loads
# 2. Upload a CSV file and ask "analyze this data"
# 3. Ask for a chart - confirm Plotly visualization renders
# 4. Connect a SharePoint source (if available)
# 5. Check /api/auth/csrf returns valid token
```

---

## 3. Post-Deploy Smoke Checks

Run immediately after production deploy:

```bash
npm run smoke:api -- https://mastiff.app
```

Expected output: all 4 checks PASS.

Manual verification:
1. **Login flow**: Sign in with test credentials.
2. **File upload**: Upload a small CSV; confirm metadata extraction.
3. **Chat query**: Ask `"Analyze the trend"` with a file attached.
4. **Chart rendering**: Ask `"Show a bar chart of revenue"` - expect Plotly output.
5. **SharePoint OAuth**: Navigate to connector setup, verify redirect to Microsoft login.

---

## 4. Monitoring / Alert KPIs and Thresholds

| Metric | Threshold | Action |
|---|---|---|
| API response time (p95) | > 5s | Investigate slow queries or LLM latency |
| Error rate (5xx) | > 2% of requests in 5 min | Page on-call; check logs |
| Kernel execution failures | > 10% of executions in 10 min | Check Python environment, disk space |
| Rate limit rejections | > 50/min | Verify legitimate traffic; adjust limits |
| Gemini API errors (429/403) | > 5 in 1 min | Rotate keys; check quota dashboard |
| Memory usage | > 85% | Restart app; investigate leaks |
| Disk usage (`uploads/`) | > 80% | Archive old uploads; increase storage |
| Database connections | > 80% pool capacity | Scale connection pool; check leaks |

---

## 5. Rollback Procedure

### Quick rollback (< 5 minutes)

```bash
# SSH into production host
ssh deploy@prod-host

# Identify the previous good commit
cd /app/mastiff
git log --oneline -5

# Revert to last known good commit
git checkout <good-commit-sha>
npm ci
npm run build
pm2 restart mastiff-app

# Verify
curl -s -o /dev/null -w "%{http_code}" https://mastiff.app/
# Should return 200 or 307
```

### Docker rollback

```bash
# List recent images
docker images ghcr.io/ananthashayana7/mastiff --format "{{.Tag}} {{.CreatedAt}}" | head -5

# Rollback to previous tag
docker pull ghcr.io/ananthashayana7/mastiff:<previous-tag>
docker stop mastiff-app
docker run -d --name mastiff-app --env-file .env.production -p 3000:3000 ghcr.io/ananthashayana7/mastiff:<previous-tag>
```

### Database rollback

```bash
# Only if migration caused the issue
# Check migration history
npx drizzle-kit introspect

# Restore from backup
pg_restore -d mastiff_prod /backups/mastiff_pre_deploy.dump
```

---

## 6. Incident Handling

### 6.1 Gemini Key Exhaustion

**Symptoms**: Chat returns fallback responses; logs show `429` or `RESOURCE_EXHAUSTED`.

**Resolution**:
```bash
# 1. Check which keys are exhausted
grep -i "key exhausted\|429\|RESOURCE_EXHAUSTED" /var/log/mastiff/app.log | tail -20

# 2. Add fresh keys to .env (comma-separated)
# API_KEY=key1,key2,key3,new_key4

# 3. Restart without rebuild
pm2 restart mastiff-app

# 4. Verify
curl -s https://mastiff.app/api/auth/csrf
```

**Prevention**: Monitor key usage via Google Cloud Console. Set up billing alerts. Maintain at least 3 active keys.

### 6.2 SharePoint OAuth Failures

**Symptoms**: Connector setup fails; users see "Failed to exchange SharePoint token".

**Resolution**:
```bash
# 1. Verify credentials
echo $SHAREPOINT_TENANT_ID
echo $SHAREPOINT_CLIENT_ID
# (never echo secrets directly - verify in Azure portal)

# 2. Test token endpoint manually
curl -X POST "https://login.microsoftonline.com/$SHAREPOINT_TENANT_ID/oauth2/v2.0/token" \
  -d "client_id=$SHAREPOINT_CLIENT_ID&scope=https://graph.microsoft.com/.default&grant_type=client_credentials&client_secret=$SHAREPOINT_CLIENT_SECRET"

# 3. Check Azure App Registration
# - Verify redirect URI matches SHAREPOINT_REDIRECT_URI
# - Verify API permissions include Files.Read, Sites.Read.All
# - Check if client secret has expired

# 4. If secret expired, rotate (see Secret Rotation below)
```

### 6.3 Kernel Execution Failures

**Symptoms**: Chat responses contain error messages about Python execution; no charts generated.

**Resolution**:
```bash
# 1. Check Python availability
python3 --version

# 2. Check required packages
python3 -c "import pandas, numpy, plotly, openpyxl; print('All OK')"

# 3. If packages missing
pip3 install pandas numpy plotly openpyxl

# 4. Check disk space (kernel writes temp files)
df -h /tmp
df -h /app/mastiff/uploads

# 5. Check process limits
ulimit -a

# 6. Restart app
pm2 restart mastiff-app
```

---

## 7. Secret Rotation Checklist

| Secret | Location | Rotation Steps |
|---|---|---|
| `JWT_SECRET` | `.env.production` | 1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 2. Update env 3. Restart app 4. All existing sessions invalidated |
| `NEXTAUTH_SECRET` | `.env.production` | Same as JWT_SECRET |
| `ENCRYPTION_KEY` | `.env.production` | **CAUTION**: Re-encrypts connector credentials. 1. Backup DB 2. Update key 3. Run re-encryption migration 4. Restart |
| `API_KEY` / `GEMINI_API_KEY` | `.env.production` | 1. Generate new key in Google AI Studio 2. Add to comma-separated list 3. Restart 4. Remove old key after 24h |
| `SHAREPOINT_CLIENT_SECRET` | `.env.production` + Azure Portal | 1. Create new secret in Azure App Registration 2. Update env 3. Restart 4. Delete old secret in Azure after 24h |
| `DATABASE_URL` | `.env.production` | 1. Update Postgres password 2. Update connection string 3. Restart |
| `UPSTASH_REDIS_REST_TOKEN` | `.env.production` | 1. Rotate in Upstash console 2. Update env 3. Restart (app degrades to memory limiter if unavailable) |

---

## 8. Pilot User Onboarding Checklist

- [ ] Create user account in database or via signup flow.
- [ ] Assign appropriate role/permissions.
- [ ] Share login URL and initial credentials securely (not via email).
- [ ] Walk through: file upload, chat query, chart generation.
- [ ] Demonstrate SharePoint connector setup (if applicable).
- [ ] Set expectations: response times, data privacy, file size limits.
- [ ] Provide feedback channel (Slack/email/issue tracker).
- [ ] Monitor first 48h of usage for errors in logs.
- [ ] Schedule follow-up after 1 week for feedback.
- [ ] Document any user-reported issues for immediate triage.
