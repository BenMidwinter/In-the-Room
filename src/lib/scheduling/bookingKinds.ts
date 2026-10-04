/** Booking types offered before the schedule form. */

export const BOOKING_KINDS = [
  {
    id: 'appointment',
    label: 'Appointment',
    detail: 'A session with a client.',
    blockRole: 'client_session',
    client: 'required',
  },
  {
    id: 'support',
    label: 'Support Activity',
    detail: 'Work attached to a client.',
    blockRole: 'support',
    client: 'required',
  },
  {
    id: 'admin',
    label: 'Admin',
    detail: 'Practice admin. A client is optional.',
    blockRole: 'admin',
    client: 'optional',
  },
  {
    id: 'busy',
    label: 'Busy',
    detail: 'Block time you are unexpectedly unavailable, including outside your usual availability.',
    blockRole: 'busy',
    client: 'none',
  },
] as const

export type BookingKindId = (typeof BOOKING_KINDS)[number]['id']
export type BookingClientRule = (typeof BOOKING_KINDS)[number]['client']

export function bookingKindById(id: string | null | undefined) {
  return BOOKING_KINDS.find((kind) => kind.id === id) || BOOKING_KINDS[0]
}

export function bookingKindForBlockRole(role: string | null | undefined): BookingKindId {
  if (role === 'support') return 'support'
  if (role === 'admin') return 'admin'
  if (role === 'busy') return 'busy'
  return 'appointment'
}

export function clientRuleForBookingKind(id: string | null | undefined): BookingClientRule {
  return bookingKindById(id).client
}
