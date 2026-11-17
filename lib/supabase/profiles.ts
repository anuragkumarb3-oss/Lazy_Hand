import type { Profile } from '@/components/lazyhand/onboarding'

export async function fetchProfile(_userId: string) {
  const response = await fetch('/api/profile', { cache: 'no-store' })
  if (!response.ok) throw new Error('Profile could not be loaded.')
  const result = await response.json() as { profile: Profile | null }
  return result.profile
}

export async function saveProfile(_userId: string, profile: Profile) {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error('Profile could not be saved.')
}
