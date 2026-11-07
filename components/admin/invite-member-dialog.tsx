'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/native-select'

type InviteRole = 'student' | 'teacher' | 'staff'

export function InviteMemberDialog({ onInvited }: { onInvited?: () => void }) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('student')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  function reset() {
    setFullName('')
    setEmail('')
    setRole('student')
    setLink(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, role }),
      })
      const data = (await res.json().catch(() => ({}))) as { link?: string; error?: string }
      if (!res.ok || !data.link) {
        toast.error(data.error ?? 'No se pudo crear la invitación')
        return
      }
      setLink(data.link)
      toast.success('Invitación creada')
      onInvited?.()
    } catch {
      toast.error('Sin conexión. No se creó la invitación.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar. Seleccioná el enlace y copialo a mano.')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invitar persona</Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar persona</DialogTitle>
            <DialogDescription>
              Se crea la cuenta en tu gimnasio y se genera un enlace de un solo uso para que elija su contraseña. El sistema no envía el email: compartí el enlace por el medio que prefieras.
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="flex flex-col gap-3">
              <Label htmlFor="invite-link">Enlace de invitación</Label>
              <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Quien tenga este enlace puede entrar a la cuenta. Compartilo solo con la persona invitada.</p>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>
                  Invitar a otra persona
                </Button>
                <Button onClick={copy}>Copiar enlace</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-name">Nombre y apellido</Label>
                <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={120} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-role">Rol</Label>
                <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
                  <option value="student">Alumno</option>
                  <option value="teacher">Profesor</option>
                  <option value="staff">Personal de acceso</option>
                </NativeSelect>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Creando…' : 'Crear invitación'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
