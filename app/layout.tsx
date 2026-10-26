import type { Metadata, Viewport } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'] })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Gym System', template: '%s · Gym System' },
  description: 'Credencial digital, control de acceso con QR temporal y asistencia diaria para tu gimnasio.',
  applicationName: 'Gym System',
  appleWebApp: { capable: true, title: 'Gym System', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#15171c' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${jetbrains.variable} bg-background h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
