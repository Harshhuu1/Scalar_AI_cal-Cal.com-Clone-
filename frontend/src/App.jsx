import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from './api'

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
]

const weekdayMap = Object.fromEntries(weekdayOptions.map((day) => [day.value, day.label]))

const defaultAvailability = [
  { day_of_week: 1, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 2, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 3, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 4, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 5, start_time: '09:00', end_time: '15:00' }
]

function isoDateLocal(date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().split('T')[0]
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatDateOnly(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function toDateTimeLocalValue(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value) {
  return new Date(value).toISOString()
}

function cx(...items) {
  return items.filter(Boolean).join(' ')
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

function normalizeAvailability(rows) {
  const seen = new Set()
  return rows
    .filter((row) => {
      if (seen.has(row.day_of_week)) return false
      seen.add(row.day_of_week)
      return true
    })
    .sort((a, b) => a.day_of_week - b.day_of_week)
}

function EventTypeGrid({ events, ctaLabel = 'Book now' }) {
  return (
    <div className="public-grid">
      {events.map((event) => (
        <Link key={event.id} to={`/book/${event.slug}`} className="public-card">
          <div className="public-card-top">
            <div>
              <strong>{event.title}</strong>
              <p>{event.description}</p>
            </div>
            <Badge tone="accent">{event.duration_minutes} min</Badge>
          </div>
          <div className="event-meta">
            <span>{event.slug}</span>
            <span>{event.timezone}</span>
          </div>
          <div className="public-card-footer">
            <span>{event.availability.length} availability rules</span>
            <span>{ctaLabel}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function Calendar({ value, onChange }) {
  const [anchor, setAnchor] = useState(() => new Date(value ? `${value}T00:00:00` : new Date()))

  useEffect(() => {
    if (value) setAnchor(new Date(`${value}T00:00:00`))
  }, [value])

  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1)
  const start = new Date(firstDay)
  start.setDate(start.getDate() - firstDay.getDay())
  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(start)
    current.setDate(start.getDate() + i)
    cells.push(current)
  }

  return (
    <div className="calendar-card">
      <div className="calendar-topbar">
          <button className="ghost-btn" type="button" onClick={() => setAnchor(new Date(year, month - 1, 1))}>Prev</button>
        <div>
          <strong>{anchor.toLocaleString([], { month: 'long', year: 'numeric' })}</strong>
        </div>
          <button className="ghost-btn" type="button" onClick={() => setAnchor(new Date(year, month + 1, 1))}>Next</button>
      </div>
      <div className="calendar-grid calendar-head">
        {days.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="calendar-grid">
        {cells.map((current) => {
          const cell = isoDateLocal(current)
          const active = value === cell
          const inMonth = current.getMonth() === month
          return (
            <button
              key={cell}
              type="button"
              className={cx('calendar-cell', active && 'active', !inMonth && 'muted')}
              onClick={() => onChange(cell)}
            >
              {current.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SlotList({ slots, selected, onSelect }) {
  if (!slots.length) {
    return <div className="empty-state">No open slots on this date.</div>
  }
  return (
    <div className="slot-list">
      {slots.map((slot) => {
        const key = slot.start_at
        const active = selected === key
        return (
          <button key={key} type="button" className={cx('slot-pill', active && 'selected')} onClick={() => onSelect(key)}>
            {slot.label}
          </button>
        )
      })}
    </div>
  )
}

function AvailabilityEditor({ event, onSave }) {
  const [timezone, setTimezone] = useState(event?.timezone || 'Asia/Kolkata')
  const [rows, setRows] = useState(() => normalizeAvailability(event?.availability?.length ? event.availability : defaultAvailability))
  const [newDay, setNewDay] = useState(1)

  useEffect(() => {
    setTimezone(event?.timezone || 'Asia/Kolkata')
    const initial = normalizeAvailability(event?.availability?.length ? event.availability : defaultAvailability)
    setRows(initial)
    const firstOpen = weekdayOptions.find((day) => !initial.some((row) => row.day_of_week === day.value))
    setNewDay(firstOpen?.value ?? 1)
  }, [event])

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const addRow = () => {
    setRows((prev) => {
      if (prev.some((row) => row.day_of_week === newDay)) return prev
      return [...prev, { day_of_week: newDay, start_time: '09:00', end_time: '17:00' }].sort((a, b) => a.day_of_week - b.day_of_week)
    })
  }

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const availableDays = weekdayOptions.filter((day) => !rows.some((row) => row.day_of_week === day.value))

  return (
    <div className="panel">
      <div className="panel-title-row">
        <div>
          <h3>Availability</h3>
          <p>Set weekly hours and timezone for this event type.</p>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Timezone</span>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
        </label>
      </div>
      <div className="availability-grid">
        {rows.map((row, index) => (
          <div className="availability-day-card" key={row.day_of_week}>
            <div className="availability-day-head">
              <strong>{weekdayMap[row.day_of_week]}</strong>
              <button className="ghost-btn danger" type="button" onClick={() => removeRow(index)}>Remove</button>
            </div>
            <div className="availability-day-fields">
              <label className="field">
                <span>Start</span>
                <input
                  value={row.start_time}
                  onChange={(e) => updateRow(index, 'start_time', e.target.value)}
                  type="text"
                  inputMode="numeric"
                  placeholder="09:00"
                  aria-label={`${weekdayMap[row.day_of_week]} start time`}
                />
              </label>
              <label className="field">
                <span>End</span>
                <input
                  value={row.end_time}
                  onChange={(e) => updateRow(index, 'end_time', e.target.value)}
                  type="text"
                  inputMode="numeric"
                  placeholder="17:00"
                  aria-label={`${weekdayMap[row.day_of_week]} end time`}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="availability-add-row">
        <label className="field">
          <span>Add day</span>
          <select value={newDay} onChange={(e) => setNewDay(Number(e.target.value))}>
            {(availableDays.length ? availableDays : weekdayOptions).map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
        </label>
        <button className="ghost-btn" type="button" onClick={addRow} disabled={!availableDays.length}>Add day</button>
        <button className="primary-btn" type="button" onClick={() => onSave({ timezone, availability: rows })}>Save availability</button>
      </div>
    </div>
  )
}

function PublicHome() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.eventTypes()
      .then((data) => {
        setEvents(data)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="page-shell"><div className="loading">Loading booking options...</div></div>
  }

  if (error) {
    return <div className="page-shell"><div className="error-box">{error}</div></div>
  }

  return (
    <div className="page-shell public-home-shell">
      <header className="public-hero">
        <div className="public-hero-copy">
          <Badge tone="accent">Public scheduling</Badge>
          <h1>Pick a time that works for you</h1>
          <p>Select one of the available meeting types below and book without logging in.</p>
          <div className="public-hero-stats">
            <div>
              <strong>{events.length}</strong>
              <span>event types</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>availability</span>
            </div>
            <div>
              <strong>Fast</strong>
              <span>booking flow</span>
            </div>
          </div>
        </div>
        <Link className="ghost-btn public-admin-link" to="/admin">Open admin dashboard</Link>
      </header>

      <section className="public-section">
        <div className="section-heading">
          <h2>Available event types</h2>
          <p>Click any card to open its booking page.</p>
        </div>
        <EventTypeGrid events={events} />
      </section>
    </div>
  )
}

function PublicBookingStatusPage() {
  const { bookingId } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)

  useEffect(() => {
    api.publicBooking(bookingId)
      .then((data) => {
        setBooking(data)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [bookingId])

  if (loading) {
    return <div className="page-shell"><div className="loading">Loading booking status...</div></div>
  }

  if (error) {
    return <div className="page-shell"><div className="error-box">{error}</div></div>
  }

    return (
      <div className="page-shell public-shell">
        <div className="confirmation-card">
          <Badge tone={booking.status === 'cancelled' ? 'danger' : 'accent'}>
            {booking.status}
          </Badge>
          <h1>Booking status</h1>
          <p>{booking.event_title}</p>
          <p className="status-subtitle">Public reference page for this booking.</p>
          <div className="confirmation-grid">
            <div><span>Date</span><strong>{formatDate(booking.start_at)}</strong></div>
            <div><span>Guest</span><strong>{booking.booker_name}</strong></div>
            <div><span>Email</span><strong>{booking.booker_email}</strong></div>
            <div><span>Reference</span><strong>#{booking.id}</strong></div>
        </div>
        <div className="inline-actions">
          <Link className="primary-btn" to={`/book/${booking.event_slug}`}>Book again</Link>
          <Link className="ghost-btn" to="/">Go home</Link>
        </div>
      </div>
    </div>
  )
}

function OverrideManager({ event, onCreate, onDelete }) {
  const overrides = event?.overrides || []
  const [form, setForm] = useState({
    override_date: isoDateLocal(new Date()),
    mode: 'blocked',
    start_time: '09:00',
    end_time: '17:00',
    note: ''
  })

  useEffect(() => {
    setForm((prev) => ({ ...prev, note: '' }))
  }, [event?.id])

  const submit = async (e) => {
    e.preventDefault()
    await onCreate(form)
    setForm((prev) => ({ ...prev, note: '' }))
  }

  return (
    <div className="panel">
      <div className="panel-title-row">
        <div>
          <h3>Date overrides</h3>
          <p>Block dates or swap in special hours for holidays, travel, and events.</p>
        </div>
      </div>

      <form className="override-form" onSubmit={submit}>
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.override_date} onChange={(e) => setForm((prev) => ({ ...prev, override_date: e.target.value }))} />
        </label>
        <label className="field">
          <span>Mode</span>
          <select value={form.mode} onChange={(e) => setForm((prev) => ({ ...prev, mode: e.target.value }))}>
            <option value="blocked">Blocked day</option>
            <option value="custom">Custom hours</option>
          </select>
        </label>
        <label className="field">
          <span>Start</span>
          <input
            type="time"
            value={form.start_time}
            disabled={form.mode === 'blocked'}
            onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>End</span>
          <input
            type="time"
            value={form.end_time}
            disabled={form.mode === 'blocked'}
            onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
          />
        </label>
        <label className="field full">
          <span>Note</span>
          <input value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional note" />
        </label>
        <div className="inline-actions full">
          <button className="primary-btn" type="submit">Save override</button>
        </div>
      </form>

      <div className="override-list">
        {overrides.length ? overrides.map((override) => (
          <div key={override.id} className="override-card">
            <div>
              <strong>{formatDateOnly(override.override_date)}</strong>
              <p>
                {override.mode === 'blocked'
                  ? 'Blocked day'
                  : `${override.start_time} - ${override.end_time}`}
              </p>
              {override.note ? <small>{override.note}</small> : null}
            </div>
            <button className="ghost-btn danger" type="button" onClick={() => onDelete(override.id)}>Delete</button>
          </div>
        )) : (
          <div className="empty-state">No date overrides yet.</div>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [scope, setScope] = useState('upcoming')
  const [message, setMessage] = useState('')
  const [toast, setToast] = useState(null)
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    slug: '',
    timezone: 'Asia/Kolkata'
  })
  const [createSlugTouched, setCreateSlugTouched] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    slug: '',
    timezone: 'Asia/Kolkata'
  })
  const [rescheduleId, setRescheduleId] = useState(null)
  const [rescheduleValue, setRescheduleValue] = useState('')

  const selectedEvent = useMemo(
    () => dashboard?.event_types?.find((event) => event.id === selectedId) || dashboard?.event_types?.[0],
    [dashboard, selectedId]
  )

  const showToast = (text, tone = 'success') => {
    setToast({ text, tone })
  }

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(timer)
  }, [toast])

    const refresh = async ({ quiet = true } = {}) => {
      if (!quiet) setLoading(true)
      try {
        const data = await api.dashboard()
        setDashboard(data)
        setSelectedId((prev) => prev || data.event_types?.[0]?.id || null)
        setError('')
      } catch (err) {
        setError(err.message)
      } finally {
        if (!quiet) setLoading(false)
      }
    }

    useEffect(() => {
      refresh({ quiet: false })
    }, [])

  useEffect(() => {
    if (!selectedEvent) return
    setEditForm({
      title: selectedEvent.title,
      description: selectedEvent.description,
      duration_minutes: selectedEvent.duration_minutes,
      slug: selectedEvent.slug,
      timezone: selectedEvent.timezone
    })
    setRescheduleId(null)
    setRescheduleValue('')
  }, [selectedEvent?.id])

  const createEvent = async (e) => {
    e.preventDefault()
    setMessage('')
    try {
      await api.createEventType({
        ...createForm,
        availability: defaultAvailability
      })
      await refresh()
      showToast('Event type created.')
      setCreateForm({
        title: '',
        description: '',
        duration_minutes: 30,
        slug: '',
        timezone: 'Asia/Kolkata'
      })
      setCreateSlugTouched(false)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const saveEvent = async () => {
    if (!selectedEvent) return
    await api.updateEventType(selectedEvent.id, editForm)
    await refresh()
    showToast('Event type updated.')
  }

  const saveAvailability = async (payload) => {
    if (!selectedEvent) return
    await api.updateAvailability(selectedEvent.id, payload)
    await refresh()
    showToast('Availability saved.')
  }

  const saveOverride = async (payload) => {
    if (!selectedEvent) return
    await api.createOverride(selectedEvent.id, payload)
    await refresh()
    showToast('Date override saved.')
  }

  const deleteOverride = async (overrideId) => {
    if (!selectedEvent) return
    await api.deleteOverride(selectedEvent.id, overrideId)
    await refresh()
    showToast('Date override deleted.')
  }

    const cancel = async (id) => {
      await api.cancelBooking(id)
      await refresh()
      showToast('Booking cancelled.')
    }

  const startReschedule = (booking) => {
    setRescheduleId(booking.id)
    setRescheduleValue(toDateTimeLocalValue(booking.start_at))
  }

  const submitReschedule = async (id) => {
    await api.rescheduleBooking(id, { start_at: fromDateTimeLocalValue(rescheduleValue) })
    setRescheduleId(null)
    setRescheduleValue('')
    await refresh()
    showToast('Booking rescheduled.')
  }

    if (loading) {
      return <div className="page-shell"><div className="loading">Loading dashboard...</div></div>
    }

  if (error) {
    return <div className="page-shell"><div className="error-box">{error}</div></div>
  }

  const bookings = scope === 'upcoming' ? dashboard.upcoming_bookings : dashboard.past_bookings

  return (
    <div className="page-shell dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>Cal Clone</strong>
            <p>Scheduling dashboard</p>
          </div>
        </div>
        <nav className="side-nav">
          <a className={location.hash === '#events' ? 'active' : ''} href="#events">Event types</a>
          <a className={location.hash === '#availability' ? 'active' : ''} href="#availability">Availability</a>
          <a className={location.hash === '#bookings' ? 'active' : ''} href="#bookings">Bookings</a>
        </nav>
        <div className="sidebar-card">
          <p>Public route</p>
          <strong>/book/{selectedEvent?.slug}</strong>
          <small>Share this URL with guests.</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <Badge tone="neutral">Admin workspace</Badge>
            <h1>Scheduling dashboard</h1>
            <p>Manage event types, availability, and bookings in one place.</p>
          </div>
          <button className="ghost-btn" type="button" onClick={refresh}>Refresh</button>
        </header>

        {message ? <div className="info-banner">{message}</div> : null}

        <section className="stats-grid">
          <div className="stat-card">
            <span>Event types</span>
            <strong>{dashboard.event_types.length}</strong>
          </div>
          <div className="stat-card">
            <span>Upcoming bookings</span>
            <strong>{dashboard.upcoming_bookings.length}</strong>
          </div>
          <div className="stat-card">
            <span>Past bookings</span>
            <strong>{dashboard.past_bookings.length}</strong>
          </div>
        </section>

        <section className="grid-two">
          <div className="panel" id="events">
            <div className="panel-title-row">
              <div>
                <h3>Event types</h3>
                <p>Cal-style cards for each public booking link.</p>
              </div>
            </div>
            <div className="cards-stack">
              {dashboard.event_types.map((event) => (
                <div
                  key={event.id}
                  className={cx('event-card', selectedEvent?.id === event.id && 'selected')}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(event.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedId(event.id)
                  }}
                >
                  <div className="event-card-top">
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.description}</p>
                    </div>
                    <Badge tone="accent">{event.duration_minutes} min</Badge>
                  </div>
                  <div className="event-meta">
                    <span>{event.slug}</span>
                    <span>{event.timezone}</span>
                  </div>
                  <div className="event-meta">
                    <Link to={`/book/${event.slug}`} onClick={(e) => e.stopPropagation()}>Open booking page</Link>
                    <span>{event.availability.length} rules</span>
                    <span>{event.overrides.length} overrides</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-row">
              <div>
                <h3>Create event type</h3>
                <p>Admins can add a new booking page without login complexity.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={createEvent}>
              <label className="field">
                <span>Title</span>
                <input
                  value={createForm.title}
                  onChange={(e) => {
                    const title = e.target.value
                    setCreateForm((prev) => ({
                      ...prev,
                      title,
                      slug: createSlugTouched ? prev.slug : slugify(title)
                    }))
                  }}
                />
              </label>
              <label className="field">
                <span>Slug</span>
                <input
                  value={createForm.slug}
                  onChange={(e) => {
                    setCreateSlugTouched(true)
                    setCreateForm((prev) => ({ ...prev, slug: e.target.value }))
                  }}
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea rows="4" value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} />
              </label>
              <label className="field">
                <span>Duration</span>
                <input type="number" min="5" step="5" value={createForm.duration_minutes} onChange={(e) => setCreateForm((prev) => ({ ...prev, duration_minutes: Number(e.target.value) }))} />
              </label>
              <label className="field">
                <span>Timezone</span>
                <input value={createForm.timezone} onChange={(e) => setCreateForm((prev) => ({ ...prev, timezone: e.target.value }))} />
              </label>
              <div className="inline-actions full">
                <button className="primary-btn" type="submit">Create event</button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => {
                    setCreateSlugTouched(false)
                    setCreateForm({ title: '', description: '', duration_minutes: 30, slug: '', timezone: 'Asia/Kolkata' })
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="grid-three" id="availability">
          <AvailabilityEditor event={selectedEvent} onSave={saveAvailability} />
          <OverrideManager event={selectedEvent} onCreate={saveOverride} onDelete={deleteOverride} />

          <div className="panel">
            <div className="panel-title-row">
              <div>
                <h3>Edit event type</h3>
                <p>Update the selected event without touching its bookings.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); saveEvent() }}>
              <label className="field">
                <span>Title</span>
                <input value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} />
              </label>
              <label className="field">
                <span>Slug</span>
                <input value={editForm.slug} onChange={(e) => setEditForm((prev) => ({ ...prev, slug: e.target.value }))} />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea rows="4" value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
              </label>
              <label className="field">
                <span>Duration</span>
                <input type="number" min="5" step="5" value={editForm.duration_minutes} onChange={(e) => setEditForm((prev) => ({ ...prev, duration_minutes: Number(e.target.value) }))} />
              </label>
              <label className="field">
                <span>Timezone</span>
                <input value={editForm.timezone} onChange={(e) => setEditForm((prev) => ({ ...prev, timezone: e.target.value }))} />
              </label>
              <div className="inline-actions full">
                <button className="primary-btn" type="submit">Save changes</button>
                <button className="ghost-btn danger" type="button" onClick={async () => { if (selectedEvent && confirm('Delete this event type?')) { await api.deleteEventType(selectedEvent.id); await refresh() } }}>Delete</button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel" id="bookings">
          <div className="panel-title-row bookings-head">
            <div>
              <h3>Bookings</h3>
              <p>Upcoming and past bookings with one-click cancellation.</p>
            </div>
            <div className="segmented">
              <button type="button" className={cx(scope === 'upcoming' && 'active')} onClick={() => setScope('upcoming')}>Upcoming</button>
              <button type="button" className={cx(scope === 'past' && 'active')} onClick={() => setScope('past')}>Past</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Guest</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <React.Fragment key={booking.id}>
                    <tr className={rescheduleId === booking.id ? 'is-active' : ''}>
                      <td>
                        <strong>{booking.event_title}</strong>
                        <div className="muted">{booking.event_slug}</div>
                      </td>
                      <td>
                        <strong>{booking.booker_name}</strong>
                        <div className="muted">{booking.booker_email}</div>
                      </td>
                      <td>{formatDate(booking.start_at)}</td>
                      <td><Badge tone={booking.status === 'cancelled' ? 'danger' : 'accent'}>{booking.status}</Badge></td>
                      <td>
                        <div className="inline-actions">
                          {booking.status !== 'cancelled' ? (
                            <>
                              <button className="ghost-btn" type="button" onClick={() => startReschedule(booking)}>Reschedule</button>
                              <button className="ghost-btn danger" type="button" onClick={() => cancel(booking.id)}>Cancel</button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {rescheduleId === booking.id ? (
                      <tr className="reschedule-row">
                        <td colSpan="5">
                          <div className="reschedule-bar">
                            <div className="field">
                              <span>New date & time</span>
                              <input type="datetime-local" value={rescheduleValue} onChange={(e) => setRescheduleValue(e.target.value)} />
                            </div>
                            <div className="inline-actions">
                              <button className="primary-btn" type="button" onClick={() => submitReschedule(booking.id)}>Save</button>
                              <button className="ghost-btn" type="button" onClick={() => setRescheduleId(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {toast ? (
        <div className={`toast ${toast.tone}`}>
          <strong>{toast.tone === 'error' ? 'Error' : 'Saved'}</strong>
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  )
}

function PublicBookingPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [event, setEvent] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => isoDateLocal(new Date()))
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [form, setForm] = useState({ booker_name: '', booker_email: '' })
  const [submitted, setSubmitted] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const eventData = await api.publicEvent(slug)
      setEvent(eventData)
      const slotData = await api.slots(slug, selectedDate)
      setSlots(slotData)
      setSelectedSlot(slotData[0]?.start_at || '')
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [slug])

  useEffect(() => {
    if (!event) return
    api.slots(slug, selectedDate)
      .then((slotData) => {
        setSlots(slotData)
        setSelectedSlot(slotData[0]?.start_at || '')
      })
      .catch((err) => setError(err.message))
  }, [selectedDate, event?.id])

  const book = async (e) => {
    e.preventDefault()
    try {
      const result = await api.createBooking({
        event_type_id: event.id,
        start_at: selectedSlot,
        booker_name: form.booker_name,
        booker_email: form.booker_email
      })
      setSubmitted(result)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return <div className="page-shell"><div className="loading">Loading booking page...</div></div>
  }

  if (error && !event) {
    return (
      <div className="page-shell public-shell">
        <div className="error-box">{error}</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="page-shell public-shell">
        <div className="confirmation-card">
          <Badge tone="accent">Confirmed</Badge>
          <h1>Your booking is confirmed</h1>
          <p>{event.title} with {submitted.booker_name}</p>
          <div className="confirmation-grid">
            <div><span>Date</span><strong>{formatDate(submitted.start_at)}</strong></div>
            <div><span>Email</span><strong>{submitted.booker_email}</strong></div>
            <div><span>Duration</span><strong>{event.duration_minutes} minutes</strong></div>
            <div><span>Timezone</span><strong>{event.timezone}</strong></div>
          </div>
          <div className="inline-actions">
            <button type="button" className="primary-btn" onClick={() => navigate('/')}>Back to home</button>
            <button type="button" className="ghost-btn" onClick={() => navigate('/admin')}>Go to admin</button>
            <button type="button" className="ghost-btn" onClick={() => navigate(`/booking/${submitted.id}`)}>View status</button>
            <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>Book another</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell public-shell">
      <div className="booking-hero">
        <div className="hero-copy">
          <Badge tone="accent">Public booking</Badge>
          <h1>{event.title}</h1>
          <p>{event.description}</p>
          <div className="hero-meta">
            <span>{event.duration_minutes} minutes</span>
            <span>{event.timezone}</span>
            <span>/book/{event.slug}</span>
          </div>
        </div>

        <div className="booking-layout">
          <Calendar value={selectedDate} onChange={setSelectedDate} />

          <div className="panel">
            <div className="panel-title-row">
              <div>
                <h3>Choose a time</h3>
                <p>Select a slot for {selectedDate}.</p>
              </div>
            </div>
            <SlotList slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} />
            <form className="booking-form" onSubmit={book}>
              <label className="field">
                <span>Name</span>
                <input required value={form.booker_name} onChange={(e) => setForm((prev) => ({ ...prev, booker_name: e.target.value }))} />
              </label>
              <label className="field">
                <span>Email</span>
                <input required type="email" value={form.booker_email} onChange={(e) => setForm((prev) => ({ ...prev, booker_email: e.target.value }))} />
              </label>
              <button className="primary-btn" type="submit" disabled={!selectedSlot}>Confirm booking</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function HomeRedirect() {
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/admin" element={<Dashboard />} />
      <Route path="/book/:slug" element={<PublicBookingPage />} />
      <Route path="/booking/:bookingId" element={<PublicBookingStatusPage />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
