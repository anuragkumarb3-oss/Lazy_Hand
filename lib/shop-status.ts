export type ShopHour = {
  day_of_week: number
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

function localParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const weekday = values.find(part => part.type === 'weekday')?.value ?? 'Sun'
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
  const hour = Number(values.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(values.find(part => part.type === 'minute')?.value ?? 0)
  return { dayOfWeek, minuteOfDay: hour * 60 + minute }
}

function asMinuteOfDay(time: string | null) {
  if (!time) return null
  const match = /^(\d{2}):(\d{2})/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function shopAvailability(
  hours: ShopHour[],
  timeZone: string,
  openOverride: boolean | null,
  now = new Date(),
) {
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : 'Asia/Kolkata'
  const { dayOfWeek, minuteOfDay } = localParts(now, safeTimeZone)
  const today = hours.find(hour => hour.day_of_week === dayOfWeek)
  const opens = asMinuteOfDay(today?.opens_at ?? null)
  const closes = asMinuteOfDay(today?.closes_at ?? null)
  const scheduledOpen = Boolean(today && !today.is_closed && opens !== null && closes !== null && (
    opens < closes ? minuteOfDay >= opens && minuteOfDay < closes : minuteOfDay >= opens || minuteOfDay < closes
  ))
  const isOpen = openOverride ?? scheduledOpen
  let nextOpening: string | null = null

  if (!isOpen) {
    for (let offset = 0; offset < 8; offset += 1) {
      const day = (dayOfWeek + offset) % 7
      const row = hours.find(hour => hour.day_of_week === day)
      const start = asMinuteOfDay(row?.opens_at ?? null)
      const end = asMinuteOfDay(row?.closes_at ?? null)
      if (!row || row.is_closed || start === null || end === null || start === end) continue
      if (offset === 0 && start <= minuteOfDay) continue
      const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
      const dateLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekday
      nextOpening = `${dateLabel} at ${row.opens_at?.slice(0, 5) ?? ''}`
      break
    }
  }

  return { isOpen, nextOpening, timeZone: safeTimeZone }
}
