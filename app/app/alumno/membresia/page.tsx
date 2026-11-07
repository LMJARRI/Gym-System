import { redirect } from 'next/navigation'

// Los avisos de vencimiento enlazan acá; el estado de la membresía y los pagos viven en /app/alumno/pagos.
export default function MembershipRedirect() {
  redirect('/app/alumno/pagos')
}
