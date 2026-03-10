# DigitalOcean Deployment Guide

Quick guide for deploying MeTTa-KG to DigitalOcean App Platform.

## Prerequisites

- DigitalOcean account
- GitHub repository with container images published to GHCR
- DigitalOcean managed PostgreSQL database
- `doctl` CLI (for automated deployment)
- `uv` Python package manager (for automated deployment script)

## Architecture

- **API Service**: Rust/Rocket backend (`ghcr.io/<owner>/metta-kg-api`)
- **Mork Service**: MeTTa reasoning engine (`ghcr.io/<owner>/metta-kg-mork`)
- **Database**: DigitalOcean managed PostgreSQL
- **Frontend**: SolidJS app (deployed separately on Vercel)

## Quick Start

### Option A: Automated Deployment (Recommended)

Use the `deploy.py` script for one-command deployment.

#### 1. Setup Prerequisites

**Install doctl CLI**:

```bash
# macOS
brew install doctl

# Linux
wget https://github.com/digitalocean/doctl/releases/download/v1.108.0/doctl-1.108.0-linux-amd64.tar.gz
tar xf doctl-1.108.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin

# Windows
winget install DigitalOcean.doctl
```

**Authenticate doctl**:

```bash
doctl auth init
# Paste your DigitalOcean API token from:
# https://cloud.digitalocean.com/account/api/tokens
```

**Install uv** (Python package manager):

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### 2. Get Your App ID

```bash
doctl apps list
# Copy the ID for your metta-kg app
```

Or from the Dashboard URL: `https://cloud.digitalocean.com/apps/{APP_ID}`

#### 3. Deploy

**Basic deployment** (set password in Dashboard later):

```bash
uv run .do/deploy.py deploy --app-id <APP_ID> --github-owner <YOUR_USERNAME>
```

**With password** (automatically sets as encrypted secret):

```bash
uv run .do/deploy.py deploy \
  --app-id <APP_ID> \
  --github-owner arist76 \
  --postgres-password <PASSWORD>
```

**With custom database and frontend**:

```bash
uv run .do/deploy.py deploy \
  --app-id <APP_ID> \
  --github-owner arist76 \
  --postgres-host db-postgresql-fra1-xxxxx.db.ondigitalocean.com \
  --postgres-port 25060 \
  --postgres-password <PASSWORD> \
  --frontend-url https://metta-kg.vercel.app
```

**Using environment variables**:

```bash
export DO_APP_ID="your-app-id"
export GITHUB_OWNER="arist76"
export POSTGRES_HOST="db-postgresql-fra1-xxxxx.db.ondigitalocean.com"
export FRONTEND_URL="https://metta-kg.vercel.app"

uv run .do/deploy.py deploy
# Password can be set in Dashboard or via --postgres-password flag
```

**Dry run** (preview without deploying):

```bash
uv run .do/deploy.py deploy --app-id <APP_ID> --github-owner <OWNER> --dry-run
```

**Validate template**:

```bash
uv run .do/deploy.py validate
```

**Note**: If you don't provide `--postgres-password`, you'll need to set it manually in the DigitalOcean Dashboard (Settings → Environment Variables → POSTGRES_PASSWORD).

#### 4. Monitor Deployment

```bash
# View deployment status
doctl apps describe <APP_ID>

# View logs
doctl apps logs <APP_ID>
```

Or visit: `https://cloud.digitalocean.com/apps/<APP_ID>`

---

### Option B: Manual Deployment

### 1. Build & Publish Container Images

GitHub Actions automatically builds and publishes images when you push to `main`:

```bash
git push origin main
```

Images are published to:
- `ghcr.io/<your-github-username>/metta-kg-api:latest`
- `ghcr.io/<your-github-username>/metta-kg-mork:latest`

The workflow is fork-agnostic and uses `github.repository_owner` automatically.

### 2. Create PostgreSQL Database

In DigitalOcean Dashboard:
1. Navigate to **Databases** → **Create Database**
2. Choose **PostgreSQL** (version 14 or higher)
3. Select region and plan
4. Create database named `metta-kg`
5. Note connection details for next step

### 3. Configure app.yaml

Copy the template and replace placeholders:

```bash
cp .do/app.yaml .do/app.prod.yaml
```

Edit `.do/app.prod.yaml` and replace:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `${GITHUB_REGISTRY_OWNER}` | Your GitHub username/org | `qoba-ai`, `arist76`, `surafelfikru` |
| `POSTGRES_HOST` | Database host from step 2 | `db-postgresql-fra1-xxxxx.db.ondigitalocean.com` |
| `POSTGRES_USER` | Database username | `doadmin` |
| `POSTGRES_DB` | Database name | `metta-kg` |
| `POSTGRES_PORT` | Database port | `25060` |
| `METTA_KG_FRONTEND_URL` | Your Vercel frontend URL | `https://your-app.vercel.app` |

**Using envsubst (alternative)**:
```bash
export GITHUB_REGISTRY_OWNER=your-username
doctl apps create --spec <(envsubst < .do/app.yaml)
```

### 4. Deploy to DigitalOcean

**Option A - Using doctl CLI**:
```bash
# Create new app
doctl apps create --spec .do/app.prod.yaml

# Or update existing app
doctl apps update <APP_ID> --spec .do/app.prod.yaml
```

**Option B - Using Dashboard**:
1. Go to **Apps** → **Create App**
2. Choose **DigitalOcean Container Registry** as source
3. Upload your configured `.do/app.prod.yaml`
4. Review and create

### 5. Set Database Password Secret

In DigitalOcean Dashboard:
1. Go to your app → **Settings** → **Environment Variables**
2. Find `POSTGRES_PASSWORD` under API service
3. Click **Edit** → **Encrypt Value**
4. Paste your database password
5. Save changes

### 6. Configure Frontend

Update your Vercel frontend with the API URL:

```bash
# In your frontend deployment settings
VITE_BACKEND_URL=https://your-app.ondigitalocean.app/api
```

## Environment Variables Reference

### API Service

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_HOST` | Yes | Database connection host |
| `POSTGRES_PORT` | Yes | Database port (usually 25060) |
| `POSTGRES_USER` | Yes | Database username |
| `POSTGRES_PASSWORD` | Yes | Database password (SECRET) |
| `POSTGRES_DB` | Yes | Database name |
| `POSTGRES_SSLMODE` | Yes | SSL mode (use "require") |
| `METTA_KG_MORK_URL` | Yes | Internal Mork service URL |
| `METTA_KG_FRONTEND_URL` | Yes | Frontend URL for CORS |

### Mork Service

| Variable | Required | Description |
|----------|----------|-------------|
| `MORK_SERVER_ADDR` | Yes | Bind address (use "0.0.0.0") |
| `MORK_SERVER_PORT` | Yes | Port (use "8001") |

## Health Checks

The API service includes a health check endpoint at `/health` that returns:
```json
{"status": "ok", "service": "metta-kg-api"}
```

DigitalOcean monitors this endpoint to ensure service availability.

## Troubleshooting

### Images Not Found
- Verify images exist: `docker manifest inspect ghcr.io/<owner>/metta-kg-api:latest`
- Check GitHub Actions completed successfully
- Ensure images are public or GHCR credentials are configured

### Database Connection Failed
- Verify database is running and accessible
- Check `POSTGRES_*` environment variables
- Ensure app's trusted sources include DigitalOcean's IP range
- Verify `POSTGRES_PASSWORD` secret is set correctly

### CORS Errors
- Verify `METTA_KG_FRONTEND_URL` matches your actual frontend URL
- Check frontend's `VITE_BACKEND_URL` points to DigitalOcean app

### Health Check Failures
- Check app logs: `doctl apps logs <APP_ID>`
- Verify Rocket is listening on `0.0.0.0:8000`
- Ensure database migrations completed successfully

## Fork-Specific Notes

This configuration works across forks:

- **GitHub Actions**: Automatically uses `github.repository_owner` and `secrets.GITHUB_TOKEN`
- **Container Registry**: Each fork publishes to its own GHCR namespace
- **Deployment**: Replace `${GITHUB_REGISTRY_OWNER}` with your username/org

When merging to `qoba-ai/MeTTa-KG`:
1. GitHub Actions will publish to `ghcr.io/qoba-ai/metta-kg-*`
2. Update production `app.yaml` to use `registry: qoba-ai`
3. No other changes needed

## Additional Resources

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [DigitalOcean Managed Databases](https://docs.digitalocean.com/products/databases/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [doctl CLI Reference](https://docs.digitalocean.com/reference/doctl/)
