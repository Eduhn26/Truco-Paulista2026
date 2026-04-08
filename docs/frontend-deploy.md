# Frontend Deploy — Truco Paulista

## Objective

Publish the frontend with:
- stable Vite build
- explicit backend boundary
- OAuth callback returning to the published frontend
- React Router SPA working correctly in production

---

## Frontend environment contract

The frontend uses these public env variables:

### `VITE_APP_ENV`
Controls environment behavior.

Expected values:
- `development`
- `production`

Rules:
- in `development`, manual backend override may remain available in the UI
- in `production`, the frontend should trust the backend URL defined in env

### `VITE_DEFAULT_BACKEND_URL`
Published API boundary used by the frontend.

Examples:
- local: `http://localhost:3000`
- production: `https://your-backend-domain.onrender.com`

---

## Local development

### Recommended frontend env
```env
VITE_APP_ENV=development
VITE_DEFAULT_BACKEND_URL=http://localhost:3000
Run
cd C:\Users\Eduardo\Projetos\truco-paulista\frontend-app
npm install
npm run dev

Default local frontend:

http://localhost:5173

Expected local backend:

http://localhost:3000
Production deploy
Recommended frontend env
VITE_APP_ENV=production
VITE_DEFAULT_BACKEND_URL=https://your-backend-domain.onrender.com
Build
cd C:\Users\Eduardo\Projetos\truco-paulista\frontend-app
npm install
npm run build
Preview build locally
cd C:\Users\Eduardo\Projetos\truco-paulista\frontend-app
npm run preview

Default preview URL:

http://localhost:4173
OAuth flow requirements

The frontend starts OAuth using:

{backendUrl}/auth/google?frontendUrl={frontendOrigin}
{backendUrl}/auth/github?frontendUrl={frontendOrigin}

The callback route in the frontend is:

/auth/callback

Important behavior:

before leaving the SPA for OAuth, the frontend stores the backend URL that started the flow
after the callback returns, the frontend restores the session with that same backend boundary
this avoids production drift where the frontend origin could be mistaken for the API origin
Backend / OAuth alignment checklist

Before publishing, confirm all of these:

Frontend
published frontend URL is known
VITE_APP_ENV=production
VITE_DEFAULT_BACKEND_URL points to the real published backend
build succeeds with npm run build
Backend
CORS allows the published frontend origin
Google callback URL points to the backend callback endpoint
GitHub callback URL points to the backend callback endpoint
backend is already published and reachable from the browser
OAuth providers
allowed frontend origin is correct where needed
backend callback URLs registered in Google/GitHub match production backend routes
Vercel notes

Recommended target:

Frontend: Vercel
Backend: already published separately

For Vercel:

configure VITE_APP_ENV=production
configure VITE_DEFAULT_BACKEND_URL with the published backend URL
deploy the frontend-app project root
ensure SPA routing is preserved by the platform configuration used for the app
Final validation checklist

After publish, validate:

home opens correctly
backend boundary shown by the frontend is the published API
Google login redirects correctly
GitHub login redirects correctly
callback returns to /auth/callback
session persists and redirects to /lobby
lobby loads with authenticated session
match route opens without losing backend boundary
manual backend override is not exposed as the primary production path
production build and preview both work locally before publish