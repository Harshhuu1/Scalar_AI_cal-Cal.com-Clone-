from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from .models import AvailabilityOverride, AvailabilityRule, Booking, EventType


def parse_clock(value: str) -> time:
    hours, minutes = value.split(":")
    return time(hour=int(hours), minute=int(minutes))


def to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_zoneinfo(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def normalize_slug(value: str) -> str:
    cleaned = value.strip().lower().replace(" ", "-")
    return "".join(ch for ch in cleaned if ch.isalnum() or ch == "-")


def dt_to_local_label(dt: datetime, tz_name: str) -> str:
    local_dt = dt.astimezone(get_zoneinfo(tz_name))
    hour = local_dt.strftime("%I").lstrip("0") or "0"
    return f"{local_dt.strftime('%a, %b %d')} · {hour}:{local_dt.strftime('%M %p')}"


def booking_to_dict(booking: Booking) -> dict:
    return {
        "id": booking.id,
        "event_type_id": booking.event_type_id,
        "event_title": booking.event_type.title,
        "event_slug": booking.event_type.slug,
        "start_at": to_utc(booking.start_at),
        "end_at": to_utc(booking.end_at),
        "booker_name": booking.booker_name,
        "booker_email": booking.booker_email,
        "status": booking.status,
        "created_at": to_utc(booking.created_at),
    }


def event_to_dict(event: EventType) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "duration_minutes": event.duration_minutes,
        "slug": event.slug,
        "timezone": event.timezone,
        "created_at": event.created_at,
        "availability": [
            {"day_of_week": rule.day_of_week, "start_time": rule.start_time, "end_time": rule.end_time}
            for rule in sorted(event.availability_rules, key=lambda item: (item.day_of_week, item.start_time))
        ],
        "overrides": [
            {
                "id": override.id,
                "event_type_id": override.event_type_id,
                "override_date": override.override_date,
                "mode": "blocked" if override.is_blocked else "custom",
                "start_time": override.start_time,
                "end_time": override.end_time,
                "note": override.note,
                "created_at": to_utc(override.created_at),
            }
            for override in sorted(
                event.availability_overrides,
                key=lambda item: (item.override_date, item.start_time or "", item.end_time or ""),
            )
        ],
    }


def build_available_slots(db: Session, event: EventType, target_date: date, exclude_booking_id: int | None = None) -> list[dict]:
    tz = get_zoneinfo(event.timezone)
    overrides = [override for override in event.availability_overrides if override.override_date == target_date]
    if any(override.is_blocked for override in overrides):
        return []

    custom_windows = [
        (override.start_time, override.end_time)
        for override in overrides
        if not override.is_blocked and override.start_time and override.end_time
    ]

    rules = [rule for rule in event.availability_rules if rule.day_of_week == target_date.weekday()]
    windows = custom_windows if custom_windows else [(rule.start_time, rule.end_time) for rule in rules]
    if not windows:
        return []

    day_start = datetime.combine(target_date, time.min).replace(tzinfo=tz)
    day_end = datetime.combine(target_date, time.max).replace(tzinfo=tz)
    booking_query = select(Booking.start_at, Booking.end_at).where(
        Booking.event_type_id == event.id,
        Booking.status == "confirmed",
        and_(Booking.start_at < day_end.astimezone(timezone.utc), Booking.end_at > day_start.astimezone(timezone.utc)),
    )
    if exclude_booking_id is not None:
        booking_query = booking_query.where(Booking.id != exclude_booking_id)
    existing = db.execute(booking_query).all()

    busy_windows = [(to_utc(row[0]).astimezone(tz), to_utc(row[1]).astimezone(tz)) for row in existing]
    slots: list[dict] = []
    duration = timedelta(minutes=event.duration_minutes)

    for start_time, end_time in windows:
        window_start = datetime.combine(target_date, parse_clock(start_time)).replace(tzinfo=tz)
        window_end = datetime.combine(target_date, parse_clock(end_time)).replace(tzinfo=tz)
        cursor = window_start
        while cursor + duration <= window_end:
            candidate_end = cursor + duration
            overlaps = any(cursor < end and candidate_end > start for start, end in busy_windows)
            if not overlaps:
                utc_start = cursor.astimezone(timezone.utc)
                utc_end = candidate_end.astimezone(timezone.utc)
                slots.append(
                    {
                        "start_at": utc_start,
                        "end_at": utc_end,
                        "label": dt_to_local_label(utc_start, event.timezone),
                    }
                )
            cursor += duration

    slots.sort(key=lambda item: item["start_at"])
    return slots


def is_slot_available(db: Session, event: EventType, start_at: datetime) -> bool:
    start_at = to_utc(start_at)
    local_start = start_at.astimezone(get_zoneinfo(event.timezone))
    slots = build_available_slots(db, event, local_start.date())
    return any(slot["start_at"] == start_at for slot in slots)


def create_booking(db: Session, event: EventType, start_at: datetime, booker_name: str, booker_email: str) -> Booking:
    start_at = to_utc(start_at)
    duration = timedelta(minutes=event.duration_minutes)
    end_at = start_at + duration
    booking = Booking(
        event_type_id=event.id,
        start_at=start_at,
        end_at=end_at,
        booker_name=booker_name.strip(),
        booker_email=booker_email.strip().lower(),
        status="confirmed",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count(EventType.id))) > 0:
        return

    design_review = EventType(
        title="Design Review",
        description="A focused 30 minute review call.",
        duration_minutes=30,
        slug="design-review",
        timezone="Asia/Kolkata",
    )
    coaching = EventType(
        title="1:1 Coaching",
        description="A longer conversation for mentoring and feedback.",
        duration_minutes=45,
        slug="one-on-one-coaching",
        timezone="Asia/Kolkata",
    )
    db.add_all([design_review, coaching])
    db.flush()

    demo_rules = [
        AvailabilityRule(event_type_id=design_review.id, day_of_week=0, start_time="09:00", end_time="12:00"),
        AvailabilityRule(event_type_id=design_review.id, day_of_week=2, start_time="13:00", end_time="17:00"),
        AvailabilityRule(event_type_id=design_review.id, day_of_week=4, start_time="10:00", end_time="16:00"),
        AvailabilityRule(event_type_id=coaching.id, day_of_week=1, start_time="11:00", end_time="17:00"),
        AvailabilityRule(event_type_id=coaching.id, day_of_week=3, start_time="09:30", end_time="15:30"),
    ]
    db.add_all(demo_rules)
    db.flush()

    current_date = datetime.now(get_zoneinfo("Asia/Kolkata")).date()
    demo_overrides = [
        AvailabilityOverride(
            event_type_id=design_review.id,
            override_date=current_date + timedelta(days=3),
            is_blocked=True,
            note="Team offsite",
        ),
        AvailabilityOverride(
            event_type_id=coaching.id,
            override_date=current_date + timedelta(days=5),
            is_blocked=False,
            start_time="14:00",
            end_time="18:00",
            note="Special office hours",
        ),
    ]
    db.add_all(demo_overrides)
    db.flush()

    today = current_date
    first_slot = build_available_slots(db, design_review, today + timedelta(days=(0 - today.weekday()) % 7))
    if first_slot:
        booking = Booking(
            event_type_id=design_review.id,
            start_at=first_slot[0]["start_at"],
            end_at=first_slot[0]["end_at"],
            booker_name="Aarav Sharma",
            booker_email="aarav@example.com",
            status="confirmed",
        )
        db.add(booking)

    second_date = today + timedelta(days=(1 - today.weekday()) % 7)
    second_slot = build_available_slots(db, coaching, second_date)
    if second_slot:
        booking = Booking(
            event_type_id=coaching.id,
            start_at=second_slot[0]["start_at"],
            end_at=second_slot[0]["end_at"],
            booker_name="Priya Singh",
            booker_email="priya@example.com",
            status="confirmed",
        )
        db.add(booking)

    db.commit()
