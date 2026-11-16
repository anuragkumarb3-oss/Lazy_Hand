import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/components/lazyhand/onboarding'
import type { Role } from '@/components/lazyhand/data'

type ProfileRow = {
  id: string
  phone: string
  name: string
  role: Role
  whatsapp_number: string
  whatsapp_alerts_enabled: boolean
  village: string
  landmark: string
  shop_name: string
  shop_type: string
  vehicle: string
}

const profileColumns = 'id, phone, name, role, whatsapp_number, whatsapp_alerts_enabled, village, landmark, shop_name, shop_type, vehicle'

function fromRow(row: ProfileRow): Profile {
  return {
    phone: row.phone,
    name: row.name,
    role: row.role,
    whatsappNumber: row.whatsapp_number,
    whatsappAlertsEnabled: row.whatsapp_alerts_enabled,
    village: row.village,
    landmark: row.landmark,
    shopName: row.shop_name,
    shopType: row.shop_type,
    vehicle: row.vehicle,
  }
}

function toRow(userId: string, profile: Profile): ProfileRow {
  return {
    id: userId,
    phone: profile.phone,
    name: profile.name,
    role: profile.role,
    whatsapp_number: profile.whatsappNumber,
    whatsapp_alerts_enabled: profile.whatsappAlertsEnabled,
    village: profile.village,
    landmark: profile.landmark,
    shop_name: profile.shopName,
    shop_type: profile.shopType,
    vehicle: profile.vehicle,
  }
}

export async function fetchProfile(userId: string) {
  const { data, error } = await createClient()
    .from('profiles')
    .select(profileColumns)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? fromRow(data as ProfileRow) : null
}

export async function saveProfile(userId: string, profile: Profile) {
  const { error } = await createClient()
    .from('profiles')
    .upsert({
      id: userId,
      phone: profile.phone,
      name: profile.name,
      whatsapp_number: profile.whatsappNumber,
      whatsapp_alerts_enabled: profile.whatsappAlertsEnabled,
      village: profile.village,
      landmark: profile.landmark,
      shop_name: profile.shopName,
      vehicle: profile.vehicle,
    }, { onConflict: 'id' })

  if (error) throw error
}
