'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { Home, LayoutGrid, RefreshCw, ShoppingBag, UserRound } from 'lucide-react'
import type { Order, Role } from './lazyhand/data'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { fetchProfile, saveProfile } from '@/lib/supabase/profiles'
import {
  LocationScreen,
  LoginScreen,
  OtpScreen,
  SignupScreen,
  WelcomeScreen,
  type LocationState,
  type Profile,
} from './lazyhand/onboarding'
import { CartBar, CategoriesScreen, ConflictSheet, CustomerHome, StoreScreen } from './lazyhand/customer-shop'
import { CartScreen, OrderAgainScreen, PaymentScreen, ProfileScreen, TrackingScreen } from './lazyhand/customer-order'
import { RiderDashboard, ShopkeeperDashboard } from './lazyhand/partners'
import { emptyProfile, LazyHandProvider, useLazyHand } from './lazyhand/store'
import { BottomNav, LoadingScreen } from './lazyhand/ui'

type Stage = 'welcome' | 'location' | 'login' | 'otp' | 'signup' | 'loading' | 'app'
type Tab = 'home' | 'categories' | 'orders' | 'profile'
type Overlay = { kind: 'store'; shopId: string } | { kind: 'cart' } | { kind: 'payment' } | { kind: 'track'; orderId: string } | null

const initialLocation: LocationState = { status: 'idle', area: '', message: '' }

function isPhoneAuthUnavailable(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('phone provider') || normalized.includes('phone sign') || normalized.includes('sms provider') || normalized.includes('signups not allowed for otp')
}

function friendlyAuthError(message: string, action: 'send' | 'verify') {
  const normalized = message.toLowerCase()
  if (isPhoneAuthUnavailable(message)) {
    return 'Phone verification is not enabled for this Supabase project yet. Enable phone sign-in and configure SMS delivery to test it.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many attempts. Wait a little before requesting another code.'
  }
  if (action === 'verify' && (normalized.includes('otp') || normalized.includes('token') || normalized.includes('expired')) ) {
    return 'That code is invalid or expired. Check the latest message and try again.'
  }
  if (action === 'send' && (normalized.includes('not found') || normalized.includes('no user'))) {
    return 'We could not send a verification code. Check the number and try again.'
  }
  return action === 'send'
    ? 'We could not send a verification code. Check the number and try again.'
    : 'We could not verify that code. Please try again.'
}

async function reverseGeocode(lat: number, lon: number) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2500)
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal },
    )
    const data = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string }
    return [data.locality || data.city, data.principalSubdivision].filter(Boolean).join(', ')
  } catch {
    return ''
  } finally {
    window.clearTimeout(timeout)
  }
}

function useLocation() {
  const [location, setLocation] = useState<LocationState>(initialLocation)

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'unavailable', area: '', message: 'This browser can’t share location. You can skip and add your village during signup.' })
      return
    }
    setLocation(l => ({ ...l, status: 'loading' }))
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        const fallback = `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`
        setLocation({ status: 'granted', area: fallback, message: '' })
        const name = await reverseGeocode(latitude, longitude)
        if (name) setLocation({ status: 'granted', area: name, message: '' })
      },
      err => {
        setLocation({
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
          area: '',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was blocked. Allow it from your browser’s address bar, or skip and type your village during signup.'
              : 'We couldn’t detect your location. Try again, or skip and type your village during signup.',
        })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [])

  return { location, request }
}

function LazyHandShell({ previewMode }: { previewMode: boolean }) {
  const { profile, setProfile, setOrders, cartCount } = useLazyHand()
  const { location, request } = useLocation()
  const [stage, setStage] = useState<Stage>('welcome')
  const [sessionReady, setSessionReady] = useState(false)
  const [sellerRequestSubmitted, setSellerRequestSubmitted] = useState(false)
  const [pendingRole, setPendingRole] = useState<Role>('customer')
  const [activeRole, setActiveRole] = useState<Role>('customer')
  const [loginPhone, setLoginPhone] = useState('')
  const [afterOtp, setAfterOtp] = useState<Role>('customer')
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null)
  const [pendingPolicyKeys, setPendingPolicyKeys] = useState<string[]>([])
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null)
  const [authenticatedPhone, setAuthenticatedPhone] = useState('')
  const profileKey = authenticatedUserId ? ['lazyhand-profile', authenticatedUserId] as const : null
  const { data: savedProfile, error: profileError, isLoading: profileLoading } = useSWR(
    profileKey,
    ([, userId]) => fetchProfile(userId),
  )
  const orderKey = authenticatedUserId ? `/api/orders?user=${authenticatedUserId}` : null
  const { data: savedOrders } = useSWR(orderKey, async () => {
    const response = await fetch('/api/orders')
    if (!response.ok) throw new Error('Orders could not be loaded.')
    return response.json() as Promise<{ orders: Order[] }>
  })
  const [tab, setTab] = useState<Tab>('home')
  const [overlay, setOverlay] = useState<Overlay>(null)

  useEffect(() => {
    let active = true
    const supabase = createSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setAuthenticatedUserId(session?.user.id ?? null)
      setAuthenticatedPhone(session?.user.phone?.replace(/^\+91/, '') ?? '')
      if (!session) setSessionReady(true)
    })

    void supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      if (!active) return
      setAuthenticatedUserId(user?.id ?? null)
      setAuthenticatedPhone(user?.phone?.replace(/^\+91/, '') ?? '')
      if (!user) setSessionReady(true)
    }).catch(() => {
      if (active) setSessionReady(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authenticatedUserId || profileLoading) return
    if (profileError) {
      setSessionReady(true)
      return
    }

    setProfile(savedProfile ?? { ...emptyProfile, phone: authenticatedPhone })
    if (savedProfile) setActiveRole(savedProfile.role)
    setTab('home')
    setStage(current => current === 'welcome' ? 'app' : current)
    setSessionReady(true)
  }, [authenticatedPhone, authenticatedUserId, profileError, profileLoading, savedProfile, setProfile])

  useEffect(() => {
    if (authenticatedUserId && savedOrders) setOrders(savedOrders.orders)
  }, [authenticatedUserId, savedOrders, setOrders])

  useEffect(() => {
    if (!authenticatedUserId || !profile.phone) return
    const timer = window.setTimeout(() => {
      void saveProfile(authenticatedUserId, profile).catch(() => undefined)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [authenticatedUserId, profile])

  const area = profile.village || location.area || 'Set your location'

  const sendLoginCode = async (phone: string) => {
    const { error } = await createSupabaseClient().auth.signInWithOtp({
      phone: `+91${phone}`,
      options: { shouldCreateUser: false },
    })
    if (error) {
      if (previewMode && isPhoneAuthUnavailable(error.message)) {
        enterPreviewGuest()
        return
      }
      throw new Error(friendlyAuthError(error.message, 'send'))
    }
    setLoginPhone(phone)
    setPendingProfile(null)
    setPendingPolicyKeys([])
    setAfterOtp('customer')
    setStage('otp')
  }

  const sendSignupCode = async (newProfile: Profile, policyKeys: string[]) => {
    const { error } = await createSupabaseClient().auth.signInWithOtp({
      phone: `+91${newProfile.phone}`,
      options: { shouldCreateUser: true, data: { name: newProfile.name } },
    })
    if (error) {
      if (previewMode && isPhoneAuthUnavailable(error.message)) {
        enterPreviewGuest()
        return
      }
      throw new Error(friendlyAuthError(error.message, 'send'))
    }
    setPendingProfile(newProfile)
    setPendingPolicyKeys(policyKeys)
    setLoginPhone(newProfile.phone)
    setAfterOtp(newProfile.role)
    setStage('otp')
  }

  const verifyCode = async (code: string) => {
    const supabase = createSupabaseClient()
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+91${loginPhone}`,
      token: code,
      type: 'sms',
    })
    if (error || !data.user) throw new Error(friendlyAuthError(error?.message ?? '', 'verify'))

    let existingProfile: Profile | null
    try {
      existingProfile = await fetchProfile(data.user.id)
    } catch {
      throw new Error('Your account was verified, but we could not load your profile. Please try again.')
    }
    const requestedSellerAccess = pendingProfile?.role === 'shopkeeper'
    const verifiedProfile = pendingProfile
      ? { ...pendingProfile, role: existingProfile?.role ?? 'customer', shopType: existingProfile?.shopType ?? '' }
      : existingProfile ?? {
          ...emptyProfile,
          phone: loginPhone,
          name: typeof data.user.user_metadata?.name === 'string' ? data.user.user_metadata.name : '',
          role: 'customer',
        }
    if (pendingProfile || !existingProfile) {
      try {
        await saveProfile(data.user.id, verifiedProfile)
      } catch {
        throw new Error('Your account was verified, but we could not save your profile. Please try again.')
      }
    }
    if (pendingPolicyKeys.length || requestedSellerAccess && verifiedProfile.role !== 'shopkeeper') {
      const onboardingResponse = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: pendingProfile?.role ?? verifiedProfile.role,
          policyKeys: pendingPolicyKeys,
        }),
      })
      if (!onboardingResponse.ok) {
        throw new Error('Your account is ready, but onboarding could not be saved. Please try again.')
      }
      const onboardingResult = await onboardingResponse.json() as { sellerRequestSubmitted: boolean }
      setSellerRequestSubmitted(onboardingResult.sellerRequestSubmitted)
    }

    setAuthenticatedUserId(data.user.id)
    setAuthenticatedPhone(loginPhone)
    setProfile(verifiedProfile)
    setActiveRole(verifiedProfile.role)
    setPendingProfile(null)
    setPendingPolicyKeys([])
    setSessionReady(true)
    enterApp(verifiedProfile.role)
  }

  const enterApp = (role: Role) => {
    setActiveRole(role)
    setTab('home')
    setOverlay(null)
    setStage('loading')
    window.setTimeout(() => setStage('app'), 850)
    window.scrollTo({ top: 0 })
  }

  const enterPreviewGuest = () => {
    setProfile({ ...emptyProfile })
    setPendingProfile(null)
    setAuthenticatedUserId(null)
    setAuthenticatedPhone('')
    enterApp('customer')
  }

  const go = (next: Overlay) => {
    setOverlay(next)
    window.scrollTo({ top: 0 })
  }

  if (!sessionReady || stage === 'loading') return <LoadingScreen />

  if (stage === 'welcome')
    return (
      <WelcomeScreen
        onStart={() => {
          setStage('location')
          if (location.status === 'idle') request()
        }}
        onLogin={() => setStage('login')}
        onShopkeeperUnlock={() => setPendingRole('shopkeeper')}
      />
    )
  if (stage === 'location') return <LocationScreen location={location} onRetry={request} onContinue={() => setStage('signup')} onBack={() => setStage('welcome')} />
  if (stage === 'login')
    return (
      <LoginScreen
        onSendOtp={sendLoginCode}
        onGuest={() => {
          setProfile({ ...emptyProfile })
          enterApp('customer')
        }}
        onSignup={() => {
          setPendingRole('customer')
          setStage('signup')
        }}
        onBack={() => setStage('welcome')}
      />
    )
  if (stage === 'otp')
    return (
      <OtpScreen
        phone={loginPhone}
        onVerified={verifyCode}
        onBack={() => setStage(pendingProfile ? 'signup' : 'login')}
      />
    )
  if (stage === 'signup')
    return (
      <SignupScreen
        initial={{ ...profile, role: pendingRole, village: profile.village || (location.status === 'granted' ? location.area : '') }}
        onCreate={sendSignupCode}
        onLogin={() => setStage('login')}
        onBack={() => setStage('location')}
      />
    )

  const logout = () => {
    void createSupabaseClient().auth.signOut()
    setAuthenticatedUserId(null)
    setAuthenticatedPhone('')
    setSellerRequestSubmitted(false)
    setProfile({ ...emptyProfile })
    setOrders([])
    setOverlay(null)
    setStage('welcome')
  }

  if (activeRole === 'shopkeeper') return <ShopkeeperDashboard onExit={() => enterApp('customer')} previewMode={previewMode} />
  if (activeRole === 'rider') return <RiderDashboard onExit={() => enterApp('customer')} />

  const editAddress = () => {
    setPendingRole(profile.role)
    setStage('signup')
  }

  let body: React.ReactNode
  let showNav = true
  if (overlay?.kind === 'store') body = <StoreScreen shopId={overlay.shopId} onBack={() => go(null)} />
  else if (overlay?.kind === 'cart') {
    showNav = false
    body = <CartScreen onBack={() => go(null)} onCheckout={() => go({ kind: 'payment' })} onBrowse={() => { setTab('home'); go(null) }} />
  } else if (overlay?.kind === 'payment') {
    showNav = false
      body = <PaymentScreen area={area} onBack={() => go({ kind: 'cart' })} onEditAddress={editAddress} onPlaced={order => go({ kind: 'track', orderId: order.id })} canPlaceOrder={Boolean(authenticatedUserId)} onSignIn={() => setStage('login')} />
  } else if (overlay?.kind === 'track') {
    showNav = false
    body = <TrackingScreen orderId={overlay.orderId} onBack={() => { setTab('orders'); go(null) }} onViewAs={role => enterApp(role)} />
  } else if (tab === 'home')
    body = (
      <CustomerHome
        area={area}
        onChangeLocation={() => setStage('location')}
      />
    )
  else if (tab === 'categories') body = <CategoriesScreen />
  else if (tab === 'orders') body = <OrderAgainScreen onTrack={id => go({ kind: 'track', orderId: id })} onReordered={() => go({ kind: 'cart' })} />
  else
    body = (
      <ProfileScreen
        area={area}
        onSwitchRole={role => enterApp(role)}
        onLogout={logout}
        onOrders={() => setTab('orders')}
        onEditAddress={editAddress}
      />
    )

  return (
    <div className="mx-auto min-h-svh w-full max-w-md bg-cream text-ink">
      {sellerRequestSubmitted && <p role="status" className="border-b border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-center text-sm text-[#9A3412]">Shopkeeper request received. You can start listing after an administrator approves your account.</p>}
      {!authenticatedUserId && <p role="status" className="border-b border-[#FED7AA] bg-[#FFF7ED] px-4 py-2.5 text-center text-xs font-medium text-[#9A3412]">Guest browsing — sign in to place orders and view saved orders.</p>}
      {body}
      {showNav && (
        <>
          <CartBar onOpen={() => go({ kind: 'cart' })} />
          <BottomNav<Tab>
            items={[
              { key: 'home', label: 'Home', Icon: Home },
              { key: 'categories', label: 'Categories', Icon: LayoutGrid },
              { key: 'orders', label: 'Order Again', Icon: RefreshCw },
              { key: 'profile', label: 'Profile', Icon: cartCount ? ShoppingBag : UserRound },
            ]}
            active={tab}
            onSelect={key => {
              setTab(key)
              setOverlay(null)
              window.scrollTo({ top: 0 })
            }}
          />
        </>
      )}
      <ConflictSheet />
    </div>
  )
}

export default function LazyHandWebApp({ previewMode = false }: { previewMode?: boolean }) {
  return (
    <LazyHandProvider>
      <LazyHandShell previewMode={previewMode} />
    </LazyHandProvider>
  )
}
