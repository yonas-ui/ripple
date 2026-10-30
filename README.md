# Ripple

A time-capsule web app. Write a message, seal it until a future date, and share a link so
friends can drop their own sealed notes ("ripples") inside. When the capsule opens, everything is revealed.

**Stack:** React (Vite) · FastAPI · SQLite

## How it works

- The server never sends a capsule's message or its friends' ripples to any browser until the unlock time has passed.
  While locked, the API only returns the title, author, date and ripple count.
- Capsules are reachable only via an unguessable link (`/c/<slug>`). Anyone with the link can add ripples until it opens.
- Countdown uses server time, so a wrong device clock can't open a capsule early.
- Capsules you create are remembered in your browser (localStorage) so you can find them again.

## Run it

Backend (port 8000):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Tests

```bash
cd backend && pytest
```

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `RIPPLE_DB` | backend | SQLite file path (default `backend/ripple.db`) |
| `RIPPLE_ORIGINS` | backend | Comma-separated CORS origins |
| `VITE_API_URL` | frontend | API base URL when not using the dev proxy |

## Deploying

Build the frontend (`npm run build`) and serve `frontend/dist` from any static host, with a rewrite of
all paths to `index.html` (the app uses `/c/<slug>` URLs). Point `VITE_API_URL` at the API at build time,
and set `RIPPLE_ORIGINS` on the backend.

## Ideas for next

- Email or push reminders on the opening day
- Photo and voice attachments
- Accounts, so capsules follow you across devices
- Optional passcode per capsule
