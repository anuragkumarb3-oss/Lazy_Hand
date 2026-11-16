'use client'

import { useCallback, useState } from 'react'
import { Home, LayoutGrid, RefreshCw, ShoppingBag, UserRound } from 'lucide-react'
import type { CategoryId, Role } from './lazyhand/data'
import {
  LocationScreen,
  LoginScreen,
  OtpScreen,
  SignupScreen,
  WelcomeScreen,
  type LocationState,
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

function LazyHandShell() {
  const { profile, setProfile, cartCount } = useLazyHand()
  const { location, request } = useLocation()
  const [stage, setStage] = useState<Stage>('welcome')
  const [pendingRole, setPendingRole] = useState<Role>('customer')
  const [activeRole, setActiveRole] = useState<Role>('customer')
  const [loginPhone, setLoginPhone] = useState('')
  const [afterOtp, setAfterOtp] = useState<Role>('customer')
  const [tab, setTab] = useState<Tab>('home')
  const [category, setCategory] = useState<CategoryId>('snacks')
  const [overlay, setOverlay] = useState<Overlay>(null)

  const area = profile.village || location.area || 'Set your location'

  const enterApp = (role: Role) => {
    setActiveRole(role)
    setTab('home')
    setOverlay(null)
    setStage('loading')
    window.setTimeout(() => setStage('app'), 850)
    window.scrollTo({ top: 0 })
  }

  const go = (next: Overlay) => {
    setOverlay(next)
    window.scrollTo({ top: 0 })
  }

  if (stage === 'loading') return <LoadingScreen />

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
        onSendOtp={phone => {
          setLoginPhone(phone)
          setAfterOtp(profile.phone === phone ? profile.role : 'customer')
          setStage('otp')
        }}
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
        onVerified={() => {
          if (profile.phone !== loginPhone) setProfile({ ...profile, phone: loginPhone })
          enterApp(afterOtp)
        }}
        onBack={() => setStage(profile.phone && profile.phone === loginPhone ? 'signup' : 'login')}
      />
    )
  if (stage === 'signup')
    return (
      <SignupScreen
        initial={{ ...profile, role: pendingRole, village: profile.village || (location.status === 'granted' ? location.area : '') }}
        onCreate={created => {
          setProfile(created)
          enterApp(created.role)
        }}
        onLogin={() => setStage('login')}
        onBack={() => setStage('location')}
      />
    )

  const logout = () => {
    setProfile({ ...emptyProfile })
    setOverlay(null)
    setStage('welcome')
  }

  if (activeRole === 'shopkeeper') return <ShopkeeperDashboard onExit={() => enterApp('customer')} />
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
    body = <PaymentScreen area={area} onBack={() => go({ kind: 'cart' })} onEditAddress={editAddress} onPlaced={order => go({ kind: 'track', orderId: order.id })} />
  } else if (overlay?.kind === 'track') {
    showNav = false
    body = <TrackingScreen orderId={overlay.orderId} onBack={() => { setTab('orders'); go(null) }} onViewAs={role => enterApp(role)} />
  } else if (tab === 'home')
    body = (
      <CustomerHome
        area={area}
        onChangeLocation={() => setStage('location')}
        onOpenStore={id => go({ kind: 'store', shopId: id })}
        onOpenCategory={id => {
          setCategory(id)
          setTab('categories')
          window.scrollTo({ top: 0 })
        }}
      />
    )
  else if (tab === 'categories') body = <CategoriesScreen active={category} onSelect={setCategory} />
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

export default function LazyHandWebApp() {
  return (
    <LazyHandProvider>
      <LazyHandShell />
    </LazyHandProvider>
  )
}
