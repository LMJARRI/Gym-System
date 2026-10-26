import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gym System',
    short_name: 'Gym',
    description: 'Credencial digital y control de acceso con QR temporal.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#15171c',
    theme_color: '#15171c',
    icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }
}
