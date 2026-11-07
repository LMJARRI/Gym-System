import { cn } from '@/lib/utils'

/** Three stacked plates (green 10, blue 20, red 25) — the app's mark. */
export function BrandMark({ className, label = 'Gym System' }: { className?: string; label?: string | null }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span aria-hidden="true" className="flex items-center gap-0.5">
        <span className="h-3 w-1.5 rounded-sm bg-success" />
        <span className="h-5 w-1.5 rounded-sm bg-primary" />
        <span className="h-6 w-1.5 rounded-sm bg-destructive" />
      </span>
      {label ? <span className="text-sm font-extrabold uppercase tracking-widest">{label}</span> : null}
    </span>
  )
}
