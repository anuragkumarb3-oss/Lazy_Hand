import type { Role } from '@/components/lazyhand/data'

export const LEGAL_POLICY_VERSION = '2026-11-17-india-draft-1'

export const POLICY_KEYS_BY_ROLE: Record<Role, string[]> = {
  customer: ['terms', 'privacy', 'refunds'],
  shopkeeper: ['terms', 'privacy', 'seller_terms', 'refunds'],
  rider: ['terms', 'privacy', 'rider_terms', 'safety'],
}

export function policiesForRole(role: Role) {
  return POLICY_KEYS_BY_ROLE[role]
}
