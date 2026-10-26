'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/domain'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_AVATAR = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function uploadAvatar(file: File) {
    if (!AVATAR_TYPES.includes(file.type)) return toast.error('Usá una imagen JPG, PNG o WebP.')
    if (file.size > MAX_AVATAR) return toast.error('La imagen supera los 2 MB.')
    setUploading(true)
    const supabase = createClient()
    const ext = file.type.split('/')[1]
    const path = `avatars/${profile.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type })
    if (error) {
      setUploading(false)
      return toast.error('No se pudo subir la foto.')
    }
    const url = supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    setUploading(false)
    if (updateError) return toast.error('No se pudo guardar la foto.')
    setAvatarUrl(url)
    toast.success('Foto actualizada')
    router.refresh()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const name = fullName.trim()
    if (name.length < 2) return toast.error('Ingresá tu nombre completo.')
    setSaving(true)
    const { error } = await createClient()
      .from('profiles')
      .update({ full_name: name, phone: phone.trim() || null, birth_date: birthDate || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) return toast.error('No se pudieron guardar los cambios.')
    toast.success('Perfil actualizado')
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-lg font-bold">{initials(fullName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <Label htmlFor="avatar">Foto de perfil</Label>
          <Input
            id="avatar"
            type="file"
            accept={AVATAR_TYPES.join(',')}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadAvatar(file)
              e.target.value = ''
            }}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">{uploading ? 'Subiendo…' : 'JPG, PNG o WebP, hasta 2 MB.'}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="full_name">Nombre y apellido</Label>
          <Input id="full_name" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile.email ?? ''} disabled className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birth_date">Fecha de nacimiento</Label>
          <Input id="birth_date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-10" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
