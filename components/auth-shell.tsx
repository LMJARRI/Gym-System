import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-8 px-5 py-10">
      <Link href="/" className="flex items-center gap-2" aria-label="Gym System, inicio">
        <BrandMark />
      </Link>
      <section className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
        </header>
        {children}
      </section>
    </main>
  )
}
