
# Cal Clone

A Cal.com-inspired scheduling and booking clone built with:

- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy
- Database: SQLite for local development, PostgreSQL-compatible via `DATABASE_URL`

## What is included

- Event type management
- Weekly availability editor
- Public booking page with calendar and time slots
- Double-booking prevention on the backend
- Upcoming and past bookings dashboard
- Booking cancellation
- Booking rescheduling
- Date overrides for blocked days and custom hours
- Seeded sample data

## Local setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

By default the frontend points to `http://localhost:8000`.
If your backend is hosted elsewhere, set:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Deployment

This project is easiest to deploy as:

- Backend on Render
- Frontend on Vercel
- PostgreSQL on Render

### Backend on Render

Create a new Web Service from the `backend` folder and use:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these environment values:

- `DATABASE_URL`
  - Use your Render PostgreSQL internal database URL

The backend already supports:

- SQLite for local development
- PostgreSQL for production through `DATABASE_URL`

Health check:

- `/api/health`

### Frontend on Vercel

Create a new Vercel project using the `frontend` folder and set:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

Set this environment variable:

- `VITE_API_BASE_URL=https://your-render-backend-url.onrender.com`

The included `frontend/vercel.json` makes React routes like `/admin`, `/book/:slug`, and `/booking/:id` work correctly on refresh.

### Suggested production URLs

- Public homepage: `https://your-frontend-domain.vercel.app/`
- Public booking page: `https://your-frontend-domain.vercel.app/book/google-meet`
- Admin dashboard: `https://your-frontend-domain.vercel.app/admin`

## Data model

- `event_types`
  - Stores the bookable meeting type, slug, duration, and timezone
- `availability_rules`
  - Stores weekly working hours per event type
- `bookings`
  - Stores the confirmed bookings and cancellation status

## Assumptions

- No authentication is required for the admin side, per the assignment.
- A single default admin user is assumed.
- Booking slots are generated from weekly availability rules and duration.
- Timezone handling is based on the event type timezone.
- SQLite is used locally for convenience, but the schema works with PostgreSQL through `DATABASE_URL`.

## API endpoints

- `GET /api/dashboard`
- `GET /api/event-types`
- `POST /api/event-types`
- `PUT /api/event-types/{id}`
- `PUT /api/event-types/{id}/availability`
- `GET /api/event-types/{slug}/slots?date=YYYY-MM-DD`
- `POST /api/bookings`
- `GET /api/bookings?scope=upcoming|past`
- `PATCH /api/bookings/{id}/cancel`
<<<<<<< HEAD
=======

## Submission checklist

- Push the repo to GitHub
- Deploy the backend and confirm `/api/health` works
- Deploy the frontend with `VITE_API_BASE_URL` set to the backend URL
- Verify `/`, `/admin`, `/book/:slug`, and `/booking/:id`
- Add both live links and the GitHub repo link to your submission

## Interview talking points

- I designed the booking logic so the backend, not just the UI, prevents double booking.
- Availability is stored separately from bookings, which keeps the schema simple and explainable.
- The public page reads the current slot availability from the backend every time a date changes.
- The UI mirrors Cal.com's patterns: sidebar admin, clean cards, date picker, time slot list, and confirmation screen.
>>>>>>> 5141bad (deployement ready !!!)
