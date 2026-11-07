import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        {...props}
        className="h-10 w-full appearance-none rounded-lg border border-input bg-transparent py-2 pl-3 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground"
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
