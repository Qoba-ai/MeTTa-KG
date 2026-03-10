# MeTTa-KG Frontend

SolidJS frontend for the MeTTa Knowledge Graph application.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your backend URL:

**Local Development** (default):

```bash
VITE_BACKEND_URL=http://localhost:8000
```

**Testing with Remote Backend**:

```bash
VITE_BACKEND_URL=https://your-app.ondigitalocean.app/api
```

### 3. Run Development Server

```bash
npm run dev
```

Runs on http://localhost:5173 by default.

## Important: Restarting After Environment Changes

Vite caches environment variables at startup. After changing `.env` files:

1. Stop the dev server: `Ctrl+C`
2. Restart: `npm run dev`
3. Hot reload will NOT pick up env var changes - a full restart is required

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run serve` - Preview production build
- `npm run lint` - Run ESLint
- `npm run prettier` - Format code
- `npm run test` - Run tests

## Environment Variables

| Variable           | Required | Description              |
| ------------------ | -------- | ------------------------ |
| `VITE_BACKEND_URL` | Yes      | Backend API endpoint URL |

**Note**: Only variables prefixed with `VITE_` are accessible in client-side code and exposed to the browser.

### Common Configuration Scenarios

**Local Development with Local Backend**:

```bash
# .env
VITE_BACKEND_URL=http://localhost:8000
```

**Local Development with DigitalOcean Backend**:

```bash
# .env
VITE_BACKEND_URL=https://urchin-app-npw4b.ondigitalocean.app/api
```

Then update CORS on DigitalOcean:

- Go to Apps → metta-kg → Settings → Environment Variables
- Update `METTA_KG_FRONTEND_URL` to: `http://localhost:5173`
- Redeploy the app

**Production (Vercel)**:

- Environment variables are set in Vercel dashboard
- Go to Project Settings → Environment Variables
- Add `VITE_BACKEND_URL` with your production API URL
- Redeploy

## Debugging

### Check Configured Backend URL

Open browser DevTools console and check the Network tab:

- All API requests should go to the URL specified in `VITE_BACKEND_URL`
- If requests go to `http://localhost:8000`, the environment variable isn't loaded

### Common Issues

**Environment variables not updating**:

- Fully restart dev server (Ctrl+C, then `npm run dev`)
- Vite caches env vars at startup - hot reload won't pick up changes

**CORS errors when connecting to remote backend**:

- Verify backend's `METTA_KG_FRONTEND_URL` environment variable includes your frontend URL
- Default Vite dev port is 5173, not 3000
- Ensure the backend was redeployed after changing CORS settings

**API requests to wrong server**:

- Check `.env` file exists and has correct `VITE_BACKEND_URL`
- Verify you restarted the dev server after changing `.env`
- Check browser console logs for actual `API_URL` value

## Project Structure

```
frontend/
├── src/
│   ├── components/      # Reusable UI components
│   ├── lib/
│   │   ├── api.ts       # API client and environment config
│   │   ├── state.ts     # Application state management
│   │   └── types.ts     # TypeScript type definitions
│   ├── routes/          # Page components and routing
│   ├── App.tsx          # Root component
│   └── index.tsx        # Entry point
├── .env.example         # Environment template
├── .env                 # Your environment config (gitignored)
├── vite.config.ts       # Vite configuration
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Technology Stack

- **Framework**: SolidJS 1.8.11
- **Build Tool**: Vite 5.0.11
- **UI Components**: Kobalte 0.13.11
- **Styling**: Tailwind CSS 3.4.17 + SCSS
- **Code Generation**: CodeMirror 6
- **Visualization**: D3 7.9.0
- **Router**: @solidjs/router 0.14.3
- **Testing**: Vitest 3.2.4

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   ```
   VITE_BACKEND_URL=https://your-production-api.ondigitalocean.app/api
   ```
4. Vercel automatically builds and deploys on push

### Static Hosting

You can deploy the `dist` folder to any static host provider (netlify, surge, now, etc.):

```bash
npm run build
# Upload dist/ folder to your host
```

## Related Documentation

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-testing.html#env-variables)
- [SolidJS Documentation](https://docs.solidjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
