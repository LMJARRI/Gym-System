'use client'

import { useMemo } from 'react'

function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'America/Argentina/Buenos_Aires', 'America/Mexico_City', 'America/Bogota', 'America/Santiago', 'Europe/Madrid']
  }
}

/** Native select keeps the ~400 IANA zones searchable by typing on every platform. */
export function TimezoneSelect({ id, value, onChange }: { id?: string; value: string; onChange: (tz: string) => void }) {
  const zones = useMemo(() => {
    const list = allTimezones()
    return list.includes(value) ? list : [value, ...list]
  }, [value])

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll('_', ' ')}
        </option>
      ))}
    </select>
  )
}
