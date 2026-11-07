const LOCALE = 'es-AR'

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso))
}

/** Formats a calendar date (YYYY-MM-DD) without shifting it through a timezone. */
export function formatLocalDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Today's calendar date (YYYY-MM-DD) in the given timezone. */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
