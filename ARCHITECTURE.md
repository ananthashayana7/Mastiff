# System Architecture - Julius.ai Digital Twin (Mastiff)

**Version**: 1.0  
**Date**: February 13, 2026  
**Status**: Design Document (Ready for Implementation)

---

## 1. High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE LAYER                      │
├─────────────────────────────────────────────────────────────────┤
│  Browser (React/Next.js) │ Mobile Web │ Figma Designs Pipeline   │
│  - Chat Interface        │ Responsive │ - Prototype Testing      │
│  - File Manager          │ Design     │ - A/B Testing Framework  │
│  - Notebooks             │            │                          │
│  - Dashboards            │            │                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
    REST API                    WebSocket (Real-time)
    (JSON over HTTPS/TLS)       (Chat, Notifications)
        │                             │
┌───────▼─────────────────────────────▼──────────────────────────┐
│                    API GATEWAY & AUTH LAYER                     │
├──────────────────────────────────────────────────────────────────┤
│  • JWT + Refresh Token Management                               │
│  • 2FA/TOTP Validation                                          │
│  • Rate Limiting (per user/IP)                                  │
│  • CORS Policy Enforcement                                      │
│  • CSRF Token Validation                                        │
│  • Request Logging & Audit Middleware                           │
│  • Error Handling & Transformation                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼─────────┐    ┌──▼──────────┐    ┌─▼──────────┐
    │    CORE     │    │    AI &     │    │    DATA    │
    │  SERVICES   │    │ EXECUTION   │    │ CONNECTORS │
    └─────────────┘    └─────────────┘    └────────────┘
        │                  │                  │
└───────▼──────────────────▼──────────────────▼──────────────────┐
│                    BUSINESS LOGIC LAYER                        │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Chat Service                                             │  │
│ │ • Query processing & context management                  │  │
│ │ • Session state & history tracking                       │  │
│ │ • Multi-turn conversation logic                          │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ LLM Service (Model Abstraction)                          │  │
│ │ • Multi-provider support (Gemini, GPT-4, Claude)         │  │
│ │ • Prompt templating & caching                            │  │
│ │ • Token counting & cost estimation                       │  │
│ │ • Fallback & retry logic                                │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Code Generation & Validation                             │  │
│ │ • Python/SQL/R generation from queries                   │  │
│ │ • Static code analysis                                   │  │
│ │ • Library/function validation                            │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ File & Data Management                                   │  │
│ │ • Upload orchestration                                   │  │
│ │ • Schema inference                                       │  │
│ │ • Data preview generation                                │  │
│ │ • Metadata management                                    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Workspace & Collaboration                                │  │
│ │ • Workspace creation & management                        │  │
│ │ • User role assignment & enforcement                     │  │
│ │ • Session sharing logic                                  │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Workflow Engine                                          │  │
│ │ • Template instantiation                                 │  │
│ │ • Scheduled job orchestration                            │  │
│ │ • Report generation & export                             │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
        │
        ├─────────────────────────────────────────┐
        │                                         │
┌───────▼──────────────────────┐      ┌──────────▼────────────┐
│  CODE EXECUTION & SANDBOX     │      │  EXTERNAL INTEGRATIONS│
├───────────────────────────────┤      ├──────────────────────┤
│ • Docker Container Pool       │      │ • Google Auth/API    │
│ • Resource Limits             │      │ • Microsoft Auth/API │
│ • Timeout Management          │      │ • Snowflake Conn     │
│ • Output Capture & Parse      │      │ • BigQuery Conn      │
│ • Error Handling              │      │ • PostgreSQL Conn    │
│ • Variable Inspection         │      │ • Slack Bot API      │
│ • Interactive Kernel State    │      │ • Email Service      │
└───────┬──────────────────────┘      │ • Payment Gateway    │
        │                             └──────────────────────┘
        │
        ├─────────────────────────────────────────┐
        │                                         │
   ┌────▼────────┐                    ┌──────────▼───────────┐
   │ PERSISTENCE │                    │  FEATURES & WORKERS  │
   └─────────────┘                    └──────────────────────┘
        │                                         │
└───────▼──────────────────────────────────────────▼────────────┐
│                    DATA ACCESS LAYER                          │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐  │
│ │ PostgreSQL Database (Primary Persistence)             │  │
│ │ • Users, Auth, Sessions                              │  │
│ │ • Files, Metadata, Schemas                           │  │
│ │ • Messages, Conversations                            │  │
│ │ • Connections, Credentials (encrypted)               │  │
│ │ • Audit Logs, API Keys                               │  │
│ │ • Workspaces, Collaborators, Templates               │  │
│ │ • Query Cache (for frequent queries)                 │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Redis Cache (Session/Performance)                      │  │
│ │ • Session store (TTL: 24h)                            │  │
│ │ • Query result cache                                  │  │
│ │ • Rate limit counters                                 │  │
│ │ • Real-time presence (WebSocket)                      │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ File Storage (Ephemeral)                               │  │
│ │ • Temporary upload files (auto-delete after 48h)      │  │
│ │ • Analysis results (exported on demand)               │  │
│ │ • Charts/Visualizations (cached)                      │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Task Queue (RabbitMQ/Celery)                           │  │
│ │ • Long-running analysis jobs                          │  │
│ │ • Scheduled reports                                   │  │
│ │ • Email/Slack notifications                           │  │
│ │ • Data connector syncs                                │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        │
        ├─────────────────────────────────────────┐
        │                                         │
   ┌────▼────────────────┐          ┌────────────▼──────────┐
   │ MONITORING & OPS    │          │   INFRASTRUCTURE      │
   └─────────────────────┘          └──────────────────────┘
        │                                         │
└───────▼──────────────────────────────────────────▼────────────┐
│                    OBSERVABILITY & DEPLOYMENT                 │
├──────────────────────────────────────────────────────────────┤
│ • Sentry (Error Tracking)         • Docker Compose (Dev)     │
│ • Prometheus (Metrics)             • Kubernetes (Prod)       │
│ • Grafana (Dashboards)             • GitHub Actions (CI/CD)  │
│ • ELK (Log Aggregation)            • SSL/TLS Termination     │
│ • DataDog (APM)                    • Load Balancer           │
│ • AWS CloudWatch                   • Auto-scaling Groups     │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Component Descriptions

### 2.1 Frontend Layer
**Technology**: React 19.x, Next.js 15.x, Tailwind CSS 3.x  
**Deployment**: Vercel or self-hosted

**Components**:
- `ChatWindow`: Main conversation interface with real-time updates
- `FileManager`: Upload, manage, and preview data files
- `NotebookEditor`: Cell-based editor for iterative workflows
- `Sidebar`: Navigation, workspace switcher, file browser
- `DataInspector`: Table preview with filtering/sorting
- `ChartRenderer`: Multi-library visualization (Plotly, Recharts, D3)
- `DashboardView`: Usage metrics, session history
- `TemplateGallery`: Pre-built analysis templates

**State Management**: 
- Next.js App Router (server components where possible)
- Context API for client state
- `useQuery`/`useMutation` for server state (if using React Query)

---

### 2.2 API Gateway & Authentication
**Technology**: Express.js middleware, JWT, OAuth2

**Responsibilities**:
- Token generation & validation
- 2FA/TOTP verification
- Session management (Redis-backed)
- Rate limiting (per user, IP-based)
- CORS enforcement
- CSRF token generation/validation
- Request logging for audit trail
- Error standardization

**Key Endpoints**:
```
POST   /api/auth/login          → Authenticate, return JWT + refresh
POST   /api/auth/signup         → Create account, send verification
POST   /api/auth/2fa/setup      → Generate TOTP QR code
POST   /api/auth/2fa/verify     → Verify TOTP code
POST   /api/auth/logout         → Invalidate session
POST   /api/auth/refresh        → Refresh JWT token
POST   /api/auth/forgot-password → Send reset link
```

---

### 2.3 Core Services Layer

#### 2.3.1 Chat Service
**Purpose**: Orchestrate multi-turn conversations  
**Flow**:
```
User Query
   ↓
Fetch Session Context (history, files, mode)
   ↓
Validate Query (input sanitization)
   ↓
If files present → Analysis Mode
   If no files → Conversational Mode
   ↓
Call LLM Service (get code + explanation)
   ↓
Execute Code (sandbox)
   ↓
Capture Output (charts, tables, errors)
   ↓
Format Response
   ↓
Store Message (with results)
   ↓
Stream/Return to Client
```

**Key Endpoints**:
```
POST   /api/chat               → Send message, get response
GET    /api/chat/history/{sid} → Fetch conversation history
DELETE /api/chat/{mid}         → Delete message
```

#### 2.3.2 LLM Service (Abstraction Layer)
**Purpose**: Unified interface for multiple LLM providers  
**Providers**:
- Google Gemini (current)
- OpenAI GPT-4 (Phase 2)
- Anthropic Claude (Phase 2)
- Custom models (Phase 3)

**Responsibilities**:
- Prompt templating
- Token counting
- Cost estimation
- Rate limiting
- Retry logic with exponential backoff
- Caching for identical queries

**Interface**:
```typescript
interface LLMProvider {
  generateCode(query, context): Promise<{ code, explanation }>
  chat(query, history): Promise<string>
  countTokens(text): number
  estimateCost(tokens): number
}
```

#### 2.3.3 Code Generation Service
**Purpose**: Convert queries to executable code  
**Supported Languages**:
- Python (primary, via Pandas/NumPy/SciPy/Plotly)
- SQL (for database queries)
- R (via `reticulate` bridge, Phase 2)

**Process**:
1. Extract intent from query
2. Generate code using LLM
3. Validate syntax (AST parsing)
4. Check for restricted libraries
5. Return code + explanation

**Safety Checks**:
```python
RESTRICTED_IMPORTS = [
    'os', 'subprocess', 'sys', 'shutil', 'socket',
    'requests', 'urllib', 'pickle', '__import__'
]
RESTRICTED_FUNCTIONS = [
    'eval', 'exec', 'compile', 'open', 'input'
]
# Validation in generated code
```

#### 2.3.4 Code Execution Service (Sandbox)
**Purpose**: Execute generated code safely in isolated environment

**Architecture**:
```
Query arrives
  ↓
Spin up Docker container (from sandbox image)
  ↓
Mount data files (read-only)
  ↓
Inject code + setup kernel state
  ↓
Execute with resource limits:
  - Memory: 512MB - 2GB (configurable)
  - CPU: 1 core
  - Timeout: 30s (configurable)
  ↓
Capture stdout, stderr, variables
  ↓
Extract charts (Plotly JSON, Matplotlib base64)
  ↓
Kill container
  ↓
Return results
```

**Equipment**:
- Docker container per execution (isolation)
- Python 3.12 + Jupyter kernel (for interactivity)
- Pre-installed libraries (pandas, numpy, scipy, sklearn, plotly, etc.)
- Resource limits via cgroups
- Network disabled (sandbox security)

#### 2.3.5 File Management Service
**Purpose**: Handle file uploads, parsing, schema inference

**Supported Formats**:
- CSV (via Pandas)
- Excel (.xlsx, .xls)
- Google Sheets (via OAuth)
- Parquet
- JSON
- PDF (OCR)
- DOCX

**Process**:
```
File uploaded
  ↓
Validate type & size (max 100MB)
  ↓
Move to temp storage
  ↓
Parse & infer schema
  ↓
Generate preview (first 5-10 rows)
  ↓
Extract metadata (rows, columns, dtypes, nulls%)
  ↓
Store metadata in DB
  ↓
Keep file in ephemeral storage (auto-delete after 48h)
  ↓
Return file info to client
```

#### 2.3.6 Workspace & Collaboration Service
**Purpose**: Manage workspaces, teams, permissions

**Data Model**:
```
Workspace
  ├─ Owner (User)
  ├─ Members (User[])
  │  └─ Roles (Admin, Editor, Viewer)
  ├─ Sessions (Session[])
  ├─ Templates (Template[])
  └─ Connections (Connection[])

Collaboration Features:
  • Shared sessions (read-write or read-only)
  • Audit log (who did what, when)
  • Activity feed (real-time updates)
  • Mentions & comments (Phase 2)
```

---

### 2.4 Sandbox & Code Execution

#### Dockerfile (Execution Environment)
```dockerfile
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements-sandbox.txt .
RUN pip install --no-cache-dir -r requirements-sandbox.txt

# Setup kernel
RUN python -m ipykernel install --user

# Workdir
WORKDIR /sandbox

# Security: Run as non-root
RUN useradd -m -u 1000 sandbox
USER sandbox

# Timeouts & limits enforced at orchestration level
ENTRYPOINT ["python"]
```

**requirements-sandbox.txt**:
```
pandas==2.0.0
numpy==1.24.0
scipy==1.10.0
scikit-learn==1.2.0
statsmodels==0.13.0
matplotlib==3.7.0
seaborn==0.12.0
plotly==5.13.0
ipykernel==6.20.0
sqlalchemy==2.0.0
psycopg2-binary==2.9.0
```

---

### 2.5 Data Access Layer (Persistence)

#### PostgreSQL Schema (Core)
```sql
-- Users & Auth
users (id, email, password_hash, name, created_at, 2fa_enabled, totp_secret)
sessions (id, user_id, token, expires_at, ip_address, user_agent)
api_keys (id, user_id, key_hash, name, last_used, created_at)

-- Data Management
files (id, user_id, session_id, filename, file_type, file_path, size, metadata)
file_versions (id, file_id, version, file_path, created_at)

-- Collaboration
workspaces (id, name, owner_id, created_at)
workspace_members (id, workspace_id, user_id, role, joined_at)
workspace_invites (id, workspace_id, email, role, token, expires_at)

-- Connections
connections (id, user_id, type, name, config, credentials, last_tested, created_at)

-- Core Features
sessions (id, user_id, workspace_id, title, status, created_at, updated_at)
messages (id, session_id, role, content, code, result, charts, created_at)
templates (id, name, category, description, query, config, workspace_id, created_at)

-- Query & Cache
query_cache (id, query_hash, result, user_id, expires_at)
query_logs (id, user_id, session_id, query, tokens_used, cost, execution_time, created_at)

-- Audit
audit_logs (id, user_id, action, resource_type, resource_id, changes, ip, created_at)
```

#### Redis Cache (Session Store)
```
session:{sessionId} → {userId, workspaceId, files, context_json, expires_at}
user:{userId}:connections → {list of connection objects}
query:{hash} → {result, timestamp}
rate_limit:{userId} → {request_count, reset_at}
ws_user:{userId} → {active_sessions, presence}
```

---

### 2.6 External Integrations (Phase 2+)

#### Data Connectors
```
Google Sheets Connector
  ├─ OAuth flow
  ├─ List sheets for user
  ├─ Fetch data
  └─ Refresh on schedule

BigQuery Connector
  ├─ Service account auth
  ├─ Query builder
  ├─ Result streaming
  └─ Cost tracking

Snowflake Connector
  ├─ Connection pooling
  ├─ Query execution
  ├─ Result caching
  └─ Role-based access

Slack Integration
  ├─ Bot for notifications
  ├─ Scheduled report delivery
  ├─ Query interactions
  └─ Result sharing
```

---

## 3. Data Flow Examples

### 3.1 Data Analysis Flow

```
┌─── User uploads CSV ────┐
│                         ↓
│              Parse & Infer Schema
│                         ↓
│              Store metadata in DB
│                         ↓
│         User: "Trend for Q4 revenue?"
│                         ↓
├──→ Chat API receives query
│                         ↓
│         Fetch session context & files
│                         ↓
│    Prepare file context (schema, sample)
│                         ↓
│  Call LLM: "Generate Python code for Q4 revenue trend"
│  LLM Response:
│    code = """
│      df['date'] = pd.to_datetime(df['date'])
│      q4 = df[df['date'].dt.quarter == 4]
│      result = q4.groupby(q4['date'].dt.month)['revenue'].sum()
│      import plotly.express as px
│      fig = px.line(result, title='Q4 Revenue Trend')
│    """
│    explanation = "Filtered Q4 data and aggregated by month..."
│                         ↓
│  Validate code (no restricted imports)
│                         ↓
│  Execute in Docker sandbox:
│    Container boots with pandas, plotly pre-installed
│    Mount uploaded CSV (read-only)
│    Run code in Jupyter kernel
│    Capture result, charts, errors
│                         ↓
│  Extract results:
│    {
│      "output": "Month 10: $50K, Month 11: $75K, Month 12: $100K",
│      "charts": [{
│        "type": "plotly",
│        "data": {...}
│      }],
│      "error": null
│    }
│                         ↓
│  Store message in DB with results
│                         ↓
└─← Return to client
    Display chart + explanation
```

### 3.2 Scheduled Report Flow

```
┌─ Template: "Monthly Revenue Summary"
│  - Query: "Give me monthly revenue, forecast, YoY comparison"
│  - Schedule: Every 1st of month at 9am
│  - Recipients: ["report@company.com"]
│  - Workspace: "Finance Team"
│
├─ Cron job triggers
│
├─ Create temporary session
│
├─ Execute template query
│  └─ LLM generates code
│  └─ Code executes in sandbox
│  └─ Results captured
│
├─ Generate report
│  └─ Markdown + charts
│  └─ Export to PDF
│
├─ Send email
│  └─ PDF attachment
│  └─ Summary in body
│  └─ Link to view in app
│
└─ Log in audit trail
```

---

## 4. Security Architecture

### 4.1 Authentication & Authorization Flow
```
Client                          Server
  │                               │
  ├─ Login (email, password) ────→│
  │                               ├─ Validate credentials
  │                               ├─ Check 2FA enabled
  │                               │
  │  ← Send 2FA Challenge (TOTP)  │
  │                               │
  ├─ Submit TOTP code ───────────→│
  │                               ├─ Verify TOTP
  │  ← JWT + Refresh Token        │
  │                               │
  ├─ Store JWT in memory          │
  ├─ Store refresh in httpOnly    │
  │                               │
  ├─ All requests include JWT header
  │  Authorization: Bearer {jwt}
  │                               │
  │  ← Request                    ├─ Middleware: Verify JWT
  │                    ┌──────────┤─ Middleware: Check session
  │                    │          ├─ Middleware: Audit log
  │                    │          ├─ Route handler
  │                    │
  │  ← Response ←─────┘
```

### 4.2 Data Encryption
```
Sensitive Data:
  • Credentials (API keys, DB passwords): Fernet encryption at rest
  • User passwords: bcrypt hashing (10 rounds)
  • 2FA secrets: Encrypted in DB
  • Payment info: Never stored (use Stripe/similar)

In Transit:
  • All traffic over HTTPS/TLS 1.3
  • HSTS headers enabled
  • Certificate pinning (mobile apps)
```

### 4.3 Sandbox Isolation
```
Host Machine
  │
  ├─ Docker Daemon (runs containers)
  │
  └─ Container 1 (User Query 001)
      ├─ User: sandbox (UID 1000, unprivileged)
      ├─ Mounts:
      │  ├─ /sandbox/data (read-only CSV)
      │  ├─ /sandbox/code (read-only user code)
      │  └─ /sandbox/output (write-only results)
      ├─ Network: Disabled (no internet access)
      ├─ Resources:
      │  ├─ Memory: 512MB limit (enforced via cgroups)
      │  ├─ CPU: 1 core
      │  └─ Timeouts: 30s (enforced by orchestrator)
      └─ Result: Code cannot escape, cannot access host

     └─ Container 2, 3, 4... (Concurrent queries)
```

---

## 5. Deployment Architecture

### 5.1 Development Environment (Docker Compose)
```yaml
version: '3.8'
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mastiff
      - REDIS_URL=redis://cache:6379
      - API_KEY=gemini-xxxxx
    depends_on: [db, cache]

  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=mastiff
      - POSTGRES_PASSWORD=dev
    volumes: [postgres_data:/var/lib/postgresql/data]

  cache:
    image: redis:7-alpine
    volumes: [redis_data:/data]

  worker:
    build: .
    command: celery -A tasks worker
    depends_on: [db, cache, rabbitmq]

  rabbitmq:
    image: rabbitmq:3.12-alpine
```

### 5.2 Production Deployment (AWS Example)
```
┌─ Elastic Load Balancer (ALB)
│  ├─ Health checks
│  └─ SSL/TLS termination
│
├─ Auto Scaling Group
│  ├─ EC2 instances (t3.large, 2-10 replicas)
│  ├─ Docker instances
│  └─ Auto-scale on CPU/Memory
│
├─ RDS PostgreSQL
│  ├─ Multi-AZ for HA
│  ├─ Automated backups
│  └─ Read replicas
│
├─ ElastiCache Redis
│  ├─ Cluster mode
│  └─ Automatic failover
│
├─ S3 for file storage
│  └─ Lifecycle policies (auto-delete old files)
│
├─ CloudFront CDN
│  └─ Static assets caching
│
└─ CloudWatch Monitoring
   ├─ Logs → CloudWatch Logs
   ├─ Metrics → CloudWatch Metrics
   └─ Alerts → SNS
```

---

## 6. Technology Stack Summary

| Layer | Technology | Version | Purpose |
|--|--|--|--|
| **Frontend** | React | 19.x | UI library |
| | Next.js | 15.x | Framework |
| | TypeScript | 5.x | Type safety |
| | Tailwind CSS | 3.x | Styling |
| | Recharts/Plotly | Latest | Charts |
| **Backend** | Node.js | 20.x | Runtime |
| | Express | 4.x | Web framework |
| | TypeScript | 5.x | Type safety |
| **Database** | PostgreSQL | 16 | Primary DB |
| | Drizzle ORM | Latest | Query builder |
| | Redis | 7.x | Cache/sessions |
| **AI/ML** | Google Gemini | API | LLM (primary) |
| | Python | 3.12 | Code execution |
| | Pandas | 2.x | Data processing |
| | Plotly | 5.x | Interactive charts |
| **DevOps** | Docker | Latest | Containerization |
| | Docker Compose | 3.x | Local orchestration |
| | Kubernetes | 1.27+ | Prod orchestration |
| | GitHub Actions | Latest | CI/CD |
| **Monitoring** | Sentry | Latest | Error tracking |
| | Prometheus | Latest | Metrics |
| | Grafana | Latest | Dashboards |

---

## 7. Scalability Considerations

### 7.1 Horizontal Scaling
- Stateless API tier (multiple EC2 instances behind ALB)
- Database connections pooled via PgBouncer
- Redis for distributed session management
- Message queue (RabbitMQ) for background jobs

### 7.2 Vertical Scaling
- Allocate 2-64GB RAM for code execution based on demand
- Fast SSD storage for ephemeral file uploads
- CPU scaling for high concurrency

### 7.3 Caching Strategy
```
L1: Browser cache (static assets, 30 days)
L2: CDN cache (CloudFront, 1 day)
L3: Redis cache (query results, 24h)
L4: Database (persistent data)
```

### 7.4 Rate Limiting
```
Per-user limits (authenticated):
  - 100 queries/hour
  - 10 concurrent executions
  - 100MB file upload max
  - 5000 API requests/hour

Per-IP limits (unauthenticated):
  - 30 requests/minute
  - 500 requests/hour
```

---

## 8. Migration Path (Current → Target)

| Phase | Duration | Scope |
|--|--|--|
| **Phase 0** | (Current) | Express.js + Gemini API, basic schema |
| **Phase 1** | Weeks 1-2 | Docker sandbox, encryption, audit logs, CI/CD |
| **Phase 2** | Weeks 3-6 | Data connectors, notebooks, templates, monitoring |
| **Phase 3** | Weeks 7+ | Multi-model LLM, team collab, enterprise features |

---

**Document Version**: 1.0  
**Last Updated**: February 13, 2026  
**Owner**: Architecture Team  
**Status**: Ready for Review
