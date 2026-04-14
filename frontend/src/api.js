const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data?.detail || 'Request failed')
  }
  return data
}

export const api = {
  dashboard: () => request('/api/dashboard'),
  eventTypes: () => request('/api/event-types'),
  publicEvent: (slug) => request(`/api/event-types/${slug}/public`),
  slots: (slug, date) => request(`/api/event-types/${slug}/slots?date=${date}`),
  createEventType: (payload) => request('/api/event-types', { method: 'POST', body: JSON.stringify(payload) }),
  updateEventType: (id, payload) => request(`/api/event-types/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEventType: (id) => request(`/api/event-types/${id}`, { method: 'DELETE' }),
  updateAvailability: (id, payload) => request(`/api/event-types/${id}/availability`, { method: 'PUT', body: JSON.stringify(payload) }),
  listOverrides: (id) => request(`/api/event-types/${id}/overrides`),
  createOverride: (id, payload) => request(`/api/event-types/${id}/overrides`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteOverride: (eventId, overrideId) => request(`/api/event-types/${eventId}/overrides/${overrideId}`, { method: 'DELETE' }),
  bookings: (scope = 'upcoming') => request(`/api/bookings?scope=${scope}`),
  createBooking: (payload) => request('/api/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  publicBooking: (id) => request(`/api/bookings/${id}/public`),
  rescheduleBooking: (id, payload) => request(`/api/bookings/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(payload) }),
  cancelBooking: (id) => request(`/api/bookings/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
}
