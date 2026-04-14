from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .database import Base, engine, get_db
from .models import AvailabilityOverride, AvailabilityRule, Booking, EventType
from .schemas import (
    AvailabilityUpdate,
    AvailabilityOverrideIn,
    BookingCancel,
    BookingCreate,
    BookingOut,
    BookingReschedule,
    DashboardOut,
    EventTypeCreate,
    EventTypeOut,
    EventTypeUpdate,
    SlotItem,
)
from .services import build_available_slots, booking_to_dict, create_booking, event_to_dict, get_zoneinfo, normalize_slug, seed_demo_data, to_utc


def validate_availability_rules(rules):
    seen = set()
    for item in rules:
        if item.day_of_week in seen:
            raise HTTPException(status_code=400, detail="Duplicate availability day rules are not allowed")
        if item.start_time >= item.end_time:
            raise HTTPException(status_code=400, detail="Availability end time must be after start time")
        seen.add(item.day_of_week)


app = FastAPI(title="Cal Clone API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    from .database import SessionLocal

    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    events = db.execute(
        select(EventType).options(
            selectinload(EventType.availability_rules),
            selectinload(EventType.availability_overrides),
            selectinload(EventType.bookings),
        )
    ).scalars().all()
    all_bookings = db.execute(select(Booking).options(selectinload(Booking.event_type)).order_by(Booking.start_at.desc())).scalars().all()
    now = datetime.now(timezone.utc)
    upcoming = [booking_to_dict(item) for item in all_bookings if item.status == "confirmed" and to_utc(item.start_at) >= now]
    past = [booking_to_dict(item) for item in all_bookings if item.status == "confirmed" and to_utc(item.start_at) < now]
    return {
        "event_types": [event_to_dict(event) for event in events],
        "upcoming_bookings": upcoming,
        "past_bookings": past,
    }


@app.get("/api/event-types", response_model=list[EventTypeOut])
def list_event_types(db: Session = Depends(get_db)):
    events = db.execute(
        select(EventType)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
        .order_by(EventType.created_at.desc())
    ).scalars().all()
    return [event_to_dict(event) for event in events]


@app.post("/api/event-types", response_model=EventTypeOut)
def create_event_type(payload: EventTypeCreate, db: Session = Depends(get_db)):
    slug = normalize_slug(payload.slug)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not slug:
        raise HTTPException(status_code=400, detail="Slug is required")
    validate_availability_rules(payload.availability)
    event = EventType(
        title=payload.title.strip(),
        description=payload.description.strip(),
        duration_minutes=payload.duration_minutes,
        slug=slug,
        timezone=payload.timezone,
    )
    event.availability_rules = [
        AvailabilityRule(day_of_week=item.day_of_week, start_time=item.start_time, end_time=item.end_time)
        for item in payload.availability
    ]
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Slug already exists")
    fresh = db.execute(
        select(EventType)
        .where(EventType.id == event.id)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one()
    return event_to_dict(fresh)


@app.get("/api/event-types/{slug}", response_model=EventTypeOut)
def get_event_type(slug: str, db: Session = Depends(get_db)):
    event = db.execute(
        select(EventType)
        .where(EventType.slug == slug)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    return event_to_dict(event)


@app.put("/api/event-types/{event_id}", response_model=EventTypeOut)
def update_event_type(event_id: int, payload: EventTypeUpdate, db: Session = Depends(get_db)):
    event = db.get(EventType, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        event.title = title
    if payload.description is not None:
        event.description = payload.description.strip()
    if payload.duration_minutes is not None:
        event.duration_minutes = payload.duration_minutes
    if payload.slug is not None:
        slug = normalize_slug(payload.slug)
        if not slug:
            raise HTTPException(status_code=400, detail="Slug is required")
        event.slug = slug
    if payload.timezone is not None:
        event.timezone = payload.timezone
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Slug already exists")
    fresh = db.execute(
        select(EventType)
        .where(EventType.id == event.id)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one()
    return event_to_dict(fresh)


@app.delete("/api/event-types/{event_id}")
def delete_event_type(event_id: int, db: Session = Depends(get_db)):
    event = db.get(EventType, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    db.delete(event)
    db.commit()
    return {"status": "deleted"}


@app.put("/api/event-types/{event_id}/availability", response_model=EventTypeOut)
def update_availability(event_id: int, payload: AvailabilityUpdate, db: Session = Depends(get_db)):
    event = db.get(EventType, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    event.timezone = payload.timezone
    validate_availability_rules(payload.availability)
    db.execute(delete(AvailabilityRule).where(AvailabilityRule.event_type_id == event_id))
    event.availability_rules = [
        AvailabilityRule(day_of_week=item.day_of_week, start_time=item.start_time, end_time=item.end_time)
        for item in payload.availability
    ]
    db.commit()
    fresh = db.execute(
        select(EventType)
        .where(EventType.id == event.id)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one()
    return event_to_dict(fresh)


@app.get("/api/event-types/{event_id}/overrides")
def list_overrides(event_id: int, db: Session = Depends(get_db)):
    event = db.execute(
        select(EventType)
        .where(EventType.id == event_id)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    return event_to_dict(event)["overrides"]


@app.post("/api/event-types/{event_id}/overrides")
def create_override(event_id: int, payload: AvailabilityOverrideIn, db: Session = Depends(get_db)):
    event = db.get(EventType, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    if payload.mode == "custom" and (not payload.start_time or not payload.end_time):
        raise HTTPException(status_code=400, detail="Custom overrides require start and end times")
    if payload.mode == "custom" and payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="Override end time must be after start time")
    override = AvailabilityOverride(
        event_type_id=event_id,
        override_date=payload.override_date,
        is_blocked=payload.mode == "blocked",
        start_time=payload.start_time if payload.mode == "custom" else None,
        end_time=payload.end_time if payload.mode == "custom" else None,
        note=payload.note.strip(),
    )
    db.add(override)
    db.commit()
    fresh = db.execute(
        select(EventType)
        .where(EventType.id == event.id)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one()
    return event_to_dict(fresh)["overrides"]


@app.delete("/api/event-types/{event_id}/overrides/{override_id}")
def delete_override(event_id: int, override_id: int, db: Session = Depends(get_db)):
    override = db.execute(
        select(AvailabilityOverride).where(
            AvailabilityOverride.id == override_id,
            AvailabilityOverride.event_type_id == event_id,
        )
    ).scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    db.delete(override)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/event-types/{slug}/slots", response_model=list[SlotItem])
def get_slots(slug: str, target_date: date = Query(..., alias="date"), db: Session = Depends(get_db)):
    event = db.execute(
        select(EventType)
        .where(EventType.slug == slug)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    return build_available_slots(db, event, target_date)


@app.get("/api/event-types/{slug}/public")
def public_event(slug: str, db: Session = Depends(get_db)):
    event = db.execute(
        select(EventType)
        .where(EventType.slug == slug)
        .options(selectinload(EventType.availability_rules), selectinload(EventType.availability_overrides))
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    return event_to_dict(event)


@app.post("/api/bookings", response_model=BookingOut)
def create_booking_endpoint(payload: BookingCreate, db: Session = Depends(get_db)):
    event = db.get(EventType, payload.event_type_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event type not found")
    event_tz = get_zoneinfo(event.timezone)
    slot_date = payload.start_at.astimezone(event_tz).date()
    slots = build_available_slots(db, event, slot_date)
    if not slots:
        raise HTTPException(status_code=400, detail="No availability on this date")
    if not any(slot["start_at"] == to_utc(payload.start_at) for slot in slots):
        raise HTTPException(status_code=400, detail="Selected slot is no longer available")
    try:
        booking = create_booking(db, event, payload.start_at, payload.booker_name, payload.booker_email)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Time slot already booked")
    fresh = db.execute(
        select(Booking).where(Booking.id == booking.id).options(selectinload(Booking.event_type))
    ).scalar_one()
    return booking_to_dict(fresh)


@app.get("/api/bookings/{booking_id}/public", response_model=BookingOut)
def get_public_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.execute(
        select(Booking).where(Booking.id == booking_id).options(selectinload(Booking.event_type))
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking_to_dict(booking)


@app.patch("/api/bookings/{booking_id}/reschedule", response_model=BookingOut)
def reschedule_booking(booking_id: int, payload: BookingReschedule, db: Session = Depends(get_db)):
    booking = db.execute(
        select(Booking).where(Booking.id == booking_id).options(selectinload(Booking.event_type))
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    event = booking.event_type
    event_tz = get_zoneinfo(event.timezone)
    slot_date = payload.start_at.astimezone(event_tz).date()
    slots = build_available_slots(db, event, slot_date, exclude_booking_id=booking.id)
    if not any(slot["start_at"] == to_utc(payload.start_at) for slot in slots):
        raise HTTPException(status_code=400, detail="Selected slot is no longer available")

    new_start = to_utc(payload.start_at)
    booking.start_at = new_start
    booking.end_at = new_start + timedelta(minutes=event.duration_minutes)
    db.commit()
    fresh = db.execute(
        select(Booking).where(Booking.id == booking.id).options(selectinload(Booking.event_type))
    ).scalar_one()
    return booking_to_dict(fresh)


@app.get("/api/bookings", response_model=list[BookingOut])
def list_bookings(scope: str = Query(default="upcoming"), db: Session = Depends(get_db)):
    bookings = db.execute(select(Booking).options(selectinload(Booking.event_type)).order_by(Booking.start_at.desc())).scalars().all()
    now = datetime.now(timezone.utc)
    if scope == "past":
        items = [booking_to_dict(booking) for booking in bookings if booking.status == "confirmed" and to_utc(booking.start_at) < now]
    elif scope == "upcoming":
        items = [booking_to_dict(booking) for booking in bookings if booking.status == "confirmed" and to_utc(booking.start_at) >= now]
    else:
        items = [booking_to_dict(booking) for booking in bookings]
    return items


@app.patch("/api/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(booking_id: int, _payload: BookingCancel, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = "cancelled"
    db.commit()
    fresh = db.execute(
        select(Booking).where(Booking.id == booking.id).options(selectinload(Booking.event_type))
    ).scalar_one()
    return booking_to_dict(fresh)
