# Alpha Backend Tasks — Setup Guide

## Prerequisites

- Docker (with a running PostgreSQL container)
- Python 3.14+
- Node.js 18+
- Git

---

## Part A — Python Service (FastAPI)

### 1. Navigate to the service

```bash
cd python-service
```

### 2. Create and activate virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install fastapi==0.115.5 "uvicorn[standard]==0.32.1" sqlalchemy==2.0.41 \
  "psycopg[binary]==3.2.10" pydantic-settings==2.6.1 jinja2==3.1.4 \
  pytest==8.3.4 httpx==0.28.1
```

### 4. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### 5. Create database user and database

```bash
docker exec -it <your_postgres_container> psql -U <admin_user> -c "CREATE USER assessment_user WITH PASSWORD 'assessment_pass' SUPERUSER;"
docker exec -it <your_postgres_container> psql -U <admin_user> -c "CREATE DATABASE assessment_db OWNER assessment_user;"
```

### 6. Run migrations

```bash
# Windows
type db\migrations\001_create_sample_items.sql | docker exec -i <container> psql -U assessment_user -d assessment_db
type db\migrations\002_create_briefings.sql | docker exec -i <container> psql -U assessment_user -d assessment_db

# macOS/Linux
cat db/migrations/001_create_sample_items.sql | docker exec -i <container> psql -U assessment_user -d assessment_db
cat db/migrations/002_create_briefings.sql | docker exec -i <container> psql -U assessment_user -d assessment_db
```

### 7. Run tests

```bash
pytest tests/ -v
```

All 11 tests should pass.

### 8. Start the server

```bash
uvicorn app.main:app --reload
```

Server runs on `http://localhost:8000`  
Swagger UI: `http://localhost:8000/docs`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/briefings` | Create a new briefing |
| GET | `/briefings/{id}` | Get briefing by ID |
| POST | `/briefings/{id}/generate` | Generate the report |
| GET | `/briefings/{id}/html` | Get rendered HTML report |

### Sample Request — Create Briefing

```json
POST /briefings
{
  "companyName": "Acme Holdings",
  "ticker": "acme",
  "sector": "Industrial Technology",
  "analystName": "Jane Doe",
  "summary": "Acme is benefiting from strong enterprise demand.",
  "recommendation": "Monitor for margin expansion before increasing exposure.",
  "keyPoints": [
    "Revenue grew 18% year-over-year.",
    "Management raised full-year guidance.",
    "Enterprise subscriptions account for 62% of recurring revenue."
  ],
  "risks": [
    "Top two customers account for 41% of total revenue.",
    "International expansion may pressure margins."
  ],
  "metrics": [
    { "name": "Revenue Growth", "value": "18%" },
    { "name": "Operating Margin", "value": "22.4%" },
    { "name": "P/E Ratio", "value": "28.1x" }
  ]
}
```

---

## Part B — TypeScript Service (NestJS)

### 1. Navigate to the service

```bash
cd ts-service
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

> To get a free Gemini API key: https://aistudio.google.com/app/apikey

### 4. Run migrations

```bash
npm run migration:run
```

This creates 4 tables:
- `sample_workspaces`
- `sample_candidates`
- `candidate_documents`
- `candidate_summaries`

### 5. Run tests

```bash
npm run test
```

All 11 tests should pass.

### 6. Start the server

```bash
npm run start:dev
```

Server runs on `http://localhost:3000`  
Swagger UI: `http://localhost:3000/api`

### Authentication

All endpoints require two headers:

| Header | Example Value |
|--------|---------------|
| `x-user-id` | `user-1` |
| `x-workspace-id` | `ws-1` |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sample/candidates` | Create a candidate |
| GET | `/sample/candidates` | List candidates |
| POST | `/candidates/{candidateId}/documents` | Upload a document |
| POST | `/candidates/{candidateId}/summaries/generate` | Request AI summary |
| GET | `/candidates/{candidateId}/summaries` | List summaries |
| GET | `/candidates/{candidateId}/summaries/{summaryId}` | Get summary by ID |

### Sample Workflow

**Step 1 — Create a candidate**
```bash
curl -X POST http://localhost:3000/sample/candidates \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-1" \
  -H "x-workspace-id: ws-1" \
  -d '{"fullName": "John Doe", "email": "john@example.com"}'
```

**Step 2 — Upload a document**
```bash
curl -X POST http://localhost:3000/candidates/{candidateId}/documents \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-1" \
  -H "x-workspace-id: ws-1" \
  -d '{
    "documentType": "resume",
    "fileName": "cv.pdf",
    "rawText": "Experienced backend engineer with expertise in Node.js and PostgreSQL."
  }'
```

**Step 3 — Request AI summary**
```bash
curl -X POST http://localhost:3000/candidates/{candidateId}/summaries/generate \
  -H "x-user-id: user-1" \
  -H "x-workspace-id: ws-1"
```

**Step 4 — Poll for result**
```bash
curl http://localhost:3000/candidates/{candidateId}/summaries/{summaryId} \
  -H "x-user-id: user-1" \
  -H "x-workspace-id: ws-1"
```

### Summary Status Flow

```
pending → completed (success)
pending → failed    (LLM error)
```

### Architecture Notes

- **LLM Provider**: Gemini 2.0 Flash via REST API. Swappable via `SUMMARIZATION_PROVIDER` token in `LlmModule`.
- **Queue**: In-memory `QueueService` — jobs are fire-and-forget async calls.
- **Auth**: `FakeAuthGuard` reads `x-user-id` and `x-workspace-id` headers.
- **Workspace isolation**: All queries are scoped by `workspaceId`.
- **Migrations**: TypeORM migration files in `src/migrations/`.
