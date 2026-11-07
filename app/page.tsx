import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'

async function RedirectIfSignedIn() {
  const session = await getSession()
  if (session) redirect('/app')
  return null
}

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-12 px-5 py-8">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>

      <header className="flex items-center justify-between">
        <BrandMark />
        <Button variant="ghost" nativeButton={false} render={<Link href="/auth/login" />}>
          Ingresar
        </Button>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-balance md:text-6xl">
          Tu credencial es un QR que vence en segundos.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
          Los alumnos muestran un código temporal de un solo uso. Recepción lo escanea, el sistema valida la membresía y
          la asistencia del día se actualiza al instante.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" className="h-11 px-6" nativeButton={false} render={<Link href="/auth/sign-up" />}>
            Crear cuenta
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 px-6"
            nativeButton={false}
            render={<Link href="/auth/login" />}
          >
            Ya tengo cuenta
          </Button>
        </div>
      </section>

      <ul className="grid gap-4 border-t pt-8 text-sm leading-relaxed md:grid-cols-3">
        <li className="flex flex-col gap-1">
          <span className="font-bold">Alumno</span>
          <span className="text-muted-foreground">Credencial digital, QR temporal y asistencia en tiempo real.</span>
        </li>
        <li className="flex flex-col gap-1">
          <span className="font-bold">Recepción y profesores</span>
          <span className="text-muted-foreground">Escaneo con la cámara y resultado inmediato.</span>
        </li>
        <li className="flex flex-col gap-1">
          <span className="font-bold">Dueño</span>
          <span className="text-muted-foreground">Membresías, roles, reglas de acceso y registros.</span>
        </li>
      </ul>
    </main>
  )
}
