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

## Interview talking points

- I designed the booking logic so the backend, not just the UI, prevents double booking.
- Availability is stored separately from bookings, which keeps the schema simple and explainable.
- The public page reads the current slot availability from the backend every time a date changes.
- The UI mirrors Cal.com's patterns: sidebar admin, clean cards, date picker, time slot list, and confirmation screen.
