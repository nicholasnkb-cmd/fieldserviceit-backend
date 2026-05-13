# Hostinger Deployment Guide

This guide explains how to deploy FieldserviceIT to Hostinger shared/cloud hosting using hPanel's Git integration.

## Prerequisites

1. **Hostinger hPanel** — Active subscription (48-month plan recommended)
2. **Git repository** — GitHub, GitLab, or Bitbucket with this code
3. **MySQL database** — Created via hPanel > Databases > MySQL

## Step 1: Create MySQL Database

1. In hPanel, go to **Databases > MySQL**
2. Create a new database
3. Save the credentials:
   - Host (e.g., `mysql.hostinger.com`)
   - Database name
   - Username
   - Password
4. Note: the connection string format: `mysql://user:password@host:3306/dbname`

## Step 2: Create Two Node.js Applications

### Application A: Backend API

| Setting | Value |
|---------|-------|
| Document Root | `backend` |
| Entry Point | `dist/src/main.js` |
| Build Command | `npm ci --omit=dev && npx prisma generate && npx prisma migrate deploy && npx nest build` |
| Node.js Version | 20 |

**Environment Variables:**

| Variable | Value |
|----------|-------|
| DATABASE_URL | `mysql://user:password@host:3306/fieldserviceit` |
| JWT_SECRET | `<256-bit random hex>` |
| CORS_ORIGIN | `https://your-frontend-domain.com` |
| FRONTEND_URL | `https://your-frontend-domain.com` |
| NEXT_PUBLIC_API_URL | `https://your-backend-domain.com/v1` |
| STORAGE_TYPE | `local` (or `s3`) |
| SWAGGER_ENABLED | `false` |

### Application B: Frontend

| Setting | Value |
|---------|-------|
| Document Root | `frontend` |
| Entry Point | `.next/standalone/server.js` |
| Build Command | `npm ci --omit=dev && npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/ 2>/dev/null` |
| Node.js Version | 20 |

**Environment Variables:**

| Variable | Value |
|----------|-------|
| NEXT_PUBLIC_API_URL | `https://your-backend-domain.com/v1` |

## Step 3: Git Deployment

1. In hPanel, go to **Node.js > Git Deploy**
2. Connect your repository (GitHub/GitLab/Bitbucket)
3. Select the branch (e.g., `main`)
4. Configure each app as described above
5. Click **Deploy**

The first deployment may take 3-5 minutes. Subsequent deploys are faster.

## Step 4: Domain & SSL

1. If you got a free domain with your plan, assign it via **Domains** in hPanel
2. Go to **SSL** and enable Auto SSL (free Let's Encrypt)
3. Point domain DNS A records to Hostinger's shared IP

## Verification

After deployment completes:

```
# Backend health check
curl https://your-backend-domain.com/v1/health

# Should return: {"status":"ok"}
```

```
# Frontend
Open https://your-frontend-domain.com in a browser
```

## Local Build (Windows)

Use the PowerShell scripts to produce zip-ready packages:

```powershell
.\hostinger\build-backend.ps1   # Outputs to hostinger/dist-backend/
.\hostinger\build-frontend.ps1  # Outputs to hostinger/dist-frontend/
```

## Troubleshooting

### Build fails: "Cannot find module"
- Ensure `npm ci --omit=dev` was run (devDeps needed for build tools like `nest`, `prisma`)
- Remove `--omit=dev` from build command if needed

### Migration fails
- Verify DATABASE_URL is correct in hPanel
- Check that the MySQL host allows remote connections
- Run `npx prisma db push` if `migrate deploy` fails

### Frontend 404 on page refresh
- Next.js standalone mode handles this — ensure `.next/static` was copied to `.next/standalone/.next/static`

### App not starting
- Check hPanel > Node.js > Logs
- Ensure entry point path is correct and file exists
- Verify port binding (Hostinger assigns a custom port, read it from PORT env var if available)

## Updating

Push to your Git repository and trigger a redeploy in hPanel:

```bash
git push origin main
```

Then go to hPanel > Node.js > Git Deploy > Deploy.
