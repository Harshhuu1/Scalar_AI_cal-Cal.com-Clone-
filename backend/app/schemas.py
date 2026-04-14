from __future__ import annotations

from datetime import datetime
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AvailabilityRuleIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str


class EventTypeCreate(BaseModel):
    title: str
    description: str = ""
    duration_minutes: int = Field(default=30, ge=5, le=480)
    slug: str
    timezone: str = "Asia/Kolkata"
    availability: list[AvailabilityRuleIn] = Field(default_factory=list)


class EventTypeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    slug: Optional[str] = None
    timezone: Optional[str] = None


class AvailabilityUpdate(BaseModel):
    timezone: str
    availability: list[AvailabilityRuleIn]


class AvailabilityOverrideIn(BaseModel):
    override_date: date
    mode: Literal["blocked", "custom"]
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: str = ""


class AvailabilityOverrideOut(BaseModel):
    id: int
    event_type_id: int
    override_date: date
    mode: Literal["blocked", "custom"]
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: str
    created_at: datetime


class BookingCreate(BaseModel):
    event_type_id: int
    start_at: datetime
    booker_name: str
    booker_email: str


class BookingCancel(BaseModel):
    status: Literal["cancelled"] = "cancelled"


class SlotItem(BaseModel):
    start_at: datetime
    end_at: datetime
    label: str


class EventTypeOut(BaseModel):
    id: int
    title: str
    description: str
    duration_minutes: int
    slug: str
    timezone: str
    created_at: datetime
    availability: list[AvailabilityRuleIn]
    overrides: list[AvailabilityOverrideOut]


class BookingOut(BaseModel):
    id: int
    event_type_id: int
    event_title: str
    event_slug: str
    start_at: datetime
    end_at: datetime
    booker_name: str
    booker_email: str
    status: str
    created_at: datetime


class BookingReschedule(BaseModel):
    start_at: datetime


class DashboardOut(BaseModel):
    event_types: list[EventTypeOut]
    upcoming_bookings: list[BookingOut]
    past_bookings: list[BookingOut]
