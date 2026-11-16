import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import PartnerDashboard from './partner-dashboard'

type Screen = 'welcome' | 'location' | 'role' | 'home' | 'orders' | 'profile' | 'shop' | 'rider' | 'sellerPreview' | 'riderPreview'
type Role = 'Customer' | 'Shopkeeper' | 'Delivery partner'
type IconName = keyof typeof Ionicons.glyphMap
type SavedSession = { screen: 'home' | 'shop' | 'rider'; role: Role }

const SESSION_STORAGE_KEY = 'lazyhand-device-session'
const isSessionScreen = (value: unknown): value is SavedSession['screen'] => value === 'home' || value === 'shop' || value === 'rider'

const categories: { name: string; icon: IconName; tint: string; background: string }[] = [
  { name: 'Chips & Namkeen', icon: 'fast-food-outline', tint: '#B85B18', background: '#FFF1C9' },
  { name: 'Drinks & Juices', icon: 'water-outline', tint: '#3676CA', background: '#E5F1FF' },
  { name: 'Bakery & Biscuits', icon: 'pizza-outline', tint: '#B86A24', background: '#FFEAD5' },
  { name: 'Ice Cream & More', icon: 'ice-cream-outline', tint: '#D64182', background: '#FDE2EF' },
  { name: 'Vegetables & Fruits', icon: 'leaf-outline', tint: '#388659', background: '#E2F5E9' },
  { name: 'Dairy & Bread', icon: 'nutrition-outline', tint: '#4078CC', background: '#E4EDFF' },
]

const palette = {
  ink: '#252C37',
  forest: '#C2410C',
  leaf: '#9A3412',
  lime: '#F97316',
  paper: '#FAF7F2',
  card: '#FFFFFF',
  muted: '#727984',
  line: '#ECE6DE',
  saffron: '#FFB84A',
  softGreen: '#FFF0E2',
  danger: '#B93832',
}

function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: size * 0.34 }]}>
      <Ionicons name="hand-left" size={size * 0.49} color={palette.card} />
    </View>
  )
}

function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  loading = false,
}: {
  title: string
  onPress: () => void
  icon?: IconName
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.buttonDimmed]}
    >
      {loading ? <ActivityIndicator color={palette.card} /> : icon ? <Ionicons name={icon} size={19} color={palette.card} /> : null}
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  )
}

function QuietButton({ title, onPress, icon }: { title: string; onPress: () => void; icon: IconName }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quietButton, pressed && styles.buttonDimmed]}>
      <Ionicons name={icon} size={18} color={palette.forest} />
      <Text style={styles.quietButtonText}>{title}</Text>
    </Pressable>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={20} color={palette.ink} />
        </Pressable>
      ) : <BrandMark />}
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      {right || <View style={styles.headerSpacer} />}
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric'
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label} · Required</Text>
      <TextInput
        accessibilityLabel={`${label}, required`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA59F"
        keyboardType={keyboardType}
        style={styles.field}
      />
    </View>
  )
}

function TabBar({ active, onNavigate }: { active: 'home' | 'orders' | 'profile'; onNavigate: (screen: Screen) => void }) {
  const tabs: { label: string; screen: 'home' | 'orders' | 'profile'; icon: IconName }[] = [
    { label: 'Home', screen: 'home', icon: 'compass-outline' },
    { label: 'Orders', screen: 'orders', icon: 'receipt-outline' },
    { label: 'Profile', screen: 'profile', icon: 'person-circle-outline' },
  ]
  return (
    <View accessibilityRole="tablist" style={styles.tabBar}>
      {tabs.map(tab => {
        const selected = active === tab.screen
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.screen}
            onPress={() => onNavigate(tab.screen)}
            style={styles.tabItem}
          >
            <Ionicons name={tab.icon} size={21} color={selected ? palette.forest : palette.muted} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function LazyHandApp() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [role, setRole] = useState<Role>('Customer')
  const [sessionReady, setSessionReady] = useState(false)
  const [place, setPlace] = useState('')
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [locationMessage, setLocationMessage] = useState('')
  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const [shopName, setShopName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [phone, setPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [riderArea, setRiderArea] = useState('')
  const [notice, setNotice] = useState('')
  const [logoFailed, setLogoFailed] = useState(false)
  const entrance = useRef(new Animated.Value(0)).current
  const locationOrbit = useRef(new Animated.Value(0)).current
  const locationOrbitReverse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then(value => {
        if (!value || cancelled) return
        const saved = JSON.parse(value) as SavedSession
        if (saved && isSessionScreen(saved.screen) && ['Customer', 'Shopkeeper', 'Delivery partner'].includes(saved.role)) {
          setRole(saved.role)
          setScreen(saved.screen)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionReady(true)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    entrance.setValue(0)
    Animated.spring(entrance, { toValue: 1, useNativeDriver: false, speed: 15, bounciness: 3 }).start()
  }, [entrance, screen])

  useEffect(() => {
    if (screen !== 'location') return
    const clockwise = Animated.loop(Animated.timing(locationOrbit, { toValue: 1, duration: 14000, useNativeDriver: true }))
    const counterClockwise = Animated.loop(Animated.timing(locationOrbitReverse, { toValue: 1, duration: 9500, useNativeDriver: true }))
    clockwise.start()
    counterClockwise.start()
    return () => {
      clockwise.stop()
      counterClockwise.stop()
    }
  }, [locationOrbit, locationOrbitReverse, screen])

  const enter = (next: Screen) => {
    setNotice('')
    setScreen(next)
    if (isSessionScreen(next)) {
      void AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ screen: next, role } satisfies SavedSession)).catch(() => {
        setNotice('This device could not save your session. You may need to reopen the app manually next time.')
      })
    }
  }

  const signOut = () => {
    void AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {})
    setRole('Customer')
    setScreen('welcome')
  }

  const requestLocation = useCallback(async () => {
    setLocationState('loading')
    setLocationMessage('Waiting for location permission…')
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        setLocationState('denied')
        setLocationMessage('Location access is off. Enable it for LazyHand in your device settings, then try again.')
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      let detectedArea = ''
      try {
        const address = (await Location.reverseGeocodeAsync(position.coords))[0]
        detectedArea = [address?.district, address?.city, address?.region].filter(Boolean).join(', ')
      } catch {
        detectedArea = ''
      }
      setPlace(detectedArea || 'Current location')
      setLocationState('granted')
      setLocationMessage(detectedArea ? `Location detected near ${detectedArea}.` : 'Your current location has been detected.')
    } catch {
      setLocationState('denied')
      setLocationMessage('We couldn’t get a location fix. Check that device location is on and try again.')
    }
  }, [])

  useEffect(() => {
    if (screen === 'location') void requestLocation()
  }, [requestLocation, screen])

  const requestNotifications = async () => {
    try {
      const enabled = Platform.OS === 'web'
        ? typeof window !== 'undefined' && 'Notification' in window && await Notification.requestPermission() === 'granted'
        : await (await import('expo-notifications')).requestPermissionsAsync().then(permission => permission.granted || permission.status === 'granted')
      setNotificationEnabled(enabled)
      setNotice(enabled ? 'Permission is enabled on this device. Order alerts still need the backend service.' : 'Notifications are off. You can change this in Android Settings.')
    } catch {
      setNotice('Notification permissions are not available here. You can change them in Android Settings.')
    }
  }

  const contentStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  }

  if (!sessionReady) {
    return <SafeAreaView style={[styles.safeArea, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={palette.forest} /></SafeAreaView>
  }

  if (screen === 'welcome') return (
    <SafeAreaView style={[styles.safeArea, styles.welcomeSafeArea]}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[styles.welcome, styles.welcomeOrange, contentStyle]}>
        <View style={styles.welcomeTop}>
          <View style={styles.welcomeLogoCard}>
            {logoFailed ? (
              <Text accessibilityRole="image" accessibilityLabel="LazyHand logo" style={styles.welcomeLogoFallback}>LazyHand</Text>
            ) : (
              <Image source={require('../public/lazyhand-logo.png')} resizeMode="contain" style={styles.welcomeLogo} accessibilityLabel="LazyHand logo" onError={() => setLogoFailed(true)} />
            )}
          </View>
          <Text style={styles.welcomeBrandTitle}>LazyHand</Text>
          <Text style={styles.welcomeTagline}>Your neighborhood shops, delivered to your door.</Text>
        </View>
        <View style={styles.welcomeActions}>
          <Pressable accessibilityRole="button" onPress={() => enter('location')} style={({ pressed }) => [styles.welcomeButton, pressed && styles.buttonDimmed]}>
            <Text style={styles.welcomeButtonText}>Get started</Text>
          </Pressable>
          <Text style={styles.privacyNote}>Location access is requested after you continue.</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  )

  if (screen === 'location') return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <Header title="Your neighborhood" onBack={() => enter('welcome')} />
      <Animated.ScrollView style={[styles.screenBody, contentStyle]} contentContainerStyle={styles.locationBody}>
        <View style={styles.locationIllustration}>
          <Animated.View style={[styles.locationOrbit, { transform: [{ rotate: locationOrbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}><View style={styles.locationOrbitDot} /></Animated.View>
          <Animated.View style={[styles.locationOrbitInner, { transform: [{ rotate: locationOrbitReverse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] }) }] }]}><View style={styles.locationOrbitDotInner} /></Animated.View>
          <View style={styles.locationPin}><Ionicons name="location" size={27} color={palette.card} /></View>
        </View>
        <Text style={styles.eyebrow}>NEARBY, WITHOUT THE GUESSWORK</Text>
        <Text style={styles.pageTitle}>Find shops around you.</Text>
        <Text style={styles.bodyText}>Allow location access and LazyHand will find your current area automatically. No PIN code or typed address needed.</Text>
        <View style={styles.locationStatusCard}>
          <View style={styles.locationStatusIcon}><Ionicons name={locationState === 'granted' ? 'checkmark' : 'navigate'} size={20} color={locationState === 'granted' ? '#388659' : palette.forest} /></View>
          <View style={styles.locationStatusCopy}>
            <Text style={styles.locationStatusTitle}>{locationState === 'granted' ? 'Location detected' : locationState === 'loading' ? 'Finding your location…' : 'Waiting for location access'}</Text>
            {locationState === 'granted' && place ? <Text style={styles.locationStatusArea}>{place}</Text> : null}
            <Text accessibilityRole="text" style={styles.locationStatusMessage}>{locationMessage || 'Your device will ask for permission when this screen opens.'}</Text>
          </View>
        </View>
        {locationState === 'denied' ? <QuietButton title="Try location again" icon="locate-outline" onPress={requestLocation} /> : null}
        <View style={styles.permissionRow}><Ionicons name="shield-checkmark-outline" size={17} color={palette.leaf} /><Text style={styles.permissionText}>Your location stays on this device in this preview and is not saved to a server.</Text></View>
        <View style={styles.flexSpacer} />
        <PrimaryButton title={locationState === 'granted' ? 'Continue' : 'Continue without location'} icon="arrow-forward" onPress={() => enter('role')} />
      </Animated.ScrollView>
    </SafeAreaView>
  )

  if (screen === 'role') return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <Header title="Choose your path" onBack={() => enter('location')} />
      <Animated.ScrollView style={[styles.screenBody, contentStyle]} contentContainerStyle={styles.roleBody}>
        <Text style={styles.eyebrow}>MADE FOR YOUR NEIGHBORHOOD</Text>
        <Text style={styles.pageTitle}>How will you{ '\n' }use LazyHand?</Text>
        <Text style={styles.bodyText}>Pick a starting role. Shop and rider applications require separate review before going live.</Text>
        {([
          { name: 'Customer' as const, icon: 'bag-handle-outline' as const, desc: 'Explore nearby shops and place local orders.' },
          { name: 'Shopkeeper' as const, icon: 'storefront-outline' as const, desc: 'Register your shop and prepare to receive orders.' },
          { name: 'Delivery partner' as const, icon: 'bicycle-outline' as const, desc: 'Apply to pick up and deliver neighborhood orders.' },
        ]).map(item => {
          const selected = role === item.name
          return (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={item.name} onPress={() => setRole(item.name)} style={[styles.roleCard, selected && styles.roleCardSelected]}>
              <View style={[styles.roleIcon, selected && styles.roleIconSelected]}><Ionicons name={item.icon} size={22} color={selected ? palette.ink : palette.forest} /></View>
              <View style={styles.roleCopy}><Text style={styles.roleName}>{item.name}</Text><Text style={styles.roleDescription}>{item.desc}</Text></View>
              <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selected ? palette.forest : '#B9C3BC'} />
            </Pressable>
          )
        })}
        <View style={styles.flexSpacer} />
        <PrimaryButton title={role === 'Customer' ? 'Explore LazyHand' : role === 'Shopkeeper' ? 'Register a shop' : 'Apply as a rider'} icon="arrow-forward" onPress={() => enter(role === 'Customer' ? 'home' : role === 'Shopkeeper' ? 'shop' : 'rider')} />
        <View style={styles.previewLinks}>
          <Pressable accessibilityRole="button" onPress={() => enter('sellerPreview')} style={styles.previewLink}><Ionicons name="storefront-outline" size={15} color={palette.leaf} /><Text style={styles.previewLinkText}>Seller app preview</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => enter('riderPreview')} style={styles.previewLink}><Ionicons name="bicycle-outline" size={15} color={palette.leaf} /><Text style={styles.previewLinkText}>Rider app preview</Text></Pressable>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  )

  if (screen === 'shop' || screen === 'rider') {
    const isShop = screen === 'shop'
    const validPhone = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''))
    const valid = isShop ? Boolean(shopName.trim() && ownerName.trim() && validPhone && shopAddress.trim()) : Boolean(ownerName.trim() && validPhone && vehicle.trim() && riderArea.trim())
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <Header title={isShop ? 'Shop registration' : 'Rider application'} onBack={() => enter('role')} />
        <ScrollView contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{isShop ? 'LOCAL BUSINESS PARTNER' : 'DELIVERY PARTNER'}</Text>
          <Text style={styles.pageTitle}>{isShop ? 'Bring your shop online.' : 'Deliver good things nearby.'}</Text>
          <Text style={styles.bodyText}>{isShop ? 'Share the basics so your shop can be reviewed for the 845420 pilot.' : 'Tell us about yourself and your ride. Rider applications are reviewed before activation.'}</Text>
          <Text style={styles.fieldHint}>All fields marked Required must be completed. Your application is not sent in this preview.</Text>
          {isShop ? <Field label="Shop name" value={shopName} onChangeText={setShopName} placeholder="Your store name" /> : null}
          <Field label="Your full name" value={ownerName} onChangeText={setOwnerName} placeholder="Name as on your ID" />
          <Field label="Phone number" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" />
          {isShop ? <Field label="Shop address" value={shopAddress} onChangeText={setShopAddress} placeholder="Street, landmark, PIN code" /> : <>
            <Field label="Vehicle type" value={vehicle} onChangeText={setVehicle} placeholder="Bicycle, scooter or other" />
            <Field label="Preferred delivery area" value={riderArea} onChangeText={setRiderArea} placeholder="Area or PIN code you can serve" />
          </>}
          <View style={styles.noticeCard}><Ionicons name="lock-closed-outline" size={18} color={palette.forest} /><Text style={styles.noticeText}>Registration and document storage are not connected yet. These details stay on this screen and are not submitted or saved.</Text></View>
          <PrimaryButton title={isShop ? 'Submit shop for review' : 'Submit rider application'} icon="paper-plane-outline" disabled={!valid} onPress={() => setNotice('Submission is unavailable until the account and backend service are connected. No application was sent.')} />
          {notice ? <Text accessibilityRole="alert" style={styles.alertText}>{notice}</Text> : null}
          <QuietButton title="Back to role selection" icon="arrow-back" onPress={() => enter('role')} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (screen === 'sellerPreview' || screen === 'riderPreview') {
    return <PartnerDashboard kind={screen === 'sellerPreview' ? 'seller' : 'rider'} onBack={() => enter('role')} />
  }

  if (screen === 'orders') return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <Header title="Your orders" />
      <View style={styles.mainBody}>
        <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={27} color={palette.forest} /></View>
        <Text style={styles.pageTitle}>Your next order{ '\n' }starts nearby.</Text>
        <Text style={styles.bodyText}>There are no orders on this account yet. We will show live shop acceptance and rider updates here once ordering is connected.</Text>
        <View style={styles.noticeCard}><Ionicons name="information-circle-outline" size={18} color={palette.forest} /><Text style={styles.noticeText}>No sample orders are shown. Order history needs account sign-in and the live backend.</Text></View>
        <PrimaryButton title="Explore shops" icon="compass-outline" onPress={() => enter('home')} />
      </View>
      <TabBar active="orders" onNavigate={enter} />
    </SafeAreaView>
  )

  if (screen === 'profile') return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <Header title="Your profile" />
      <ScrollView contentContainerStyle={styles.profileBody}>
        <View style={styles.profileHero}><View style={styles.profileAvatar}><Ionicons name="person" size={29} color={palette.forest} /></View><View style={styles.profileCopy}><Text style={styles.profileName}>Welcome to LazyHand</Text><Text style={styles.profileSub}>Your session stays on this device until you sign out.</Text></View></View>
        <View style={styles.profileSection}><Text style={styles.sectionTitle}>ACCOUNT</Text><ProfileRow icon="call-outline" title="Phone sign-in" detail="OTP provider not configured" onPress={() => setNotice('Phone OTP cannot be activated without an SMS identity provider and server configuration.')} /><ProfileRow icon="location-outline" title="Delivery address" detail={locationState === 'granted' ? place || 'Current location' : 'Location not shared'} onPress={() => enter('location')} /><ProfileRow icon="notifications-outline" title="Notifications" detail={notificationEnabled ? 'Permission enabled; order alerts need backend setup' : 'Off'} onPress={requestNotifications} /></View>
        <View style={styles.profileSection}><Text style={styles.sectionTitle}>PARTNER WITH LAZYHAND</Text><ProfileRow icon="storefront-outline" title="Register a shop" detail="Admin review required" onPress={() => enter('shop')} /><ProfileRow icon="bicycle-outline" title="Become a delivery partner" detail="Apply for the pilot" onPress={() => enter('rider')} /></View>
        <View style={styles.noticeCard}><Ionicons name="shield-checkmark-outline" size={18} color={palette.forest} /><Text style={styles.noticeText}>Your session is stored on this device. LazyHand asks for location and notification permission only when you choose those actions.</Text></View>
        {notice ? <Text accessibilityRole="alert" style={styles.alertText}>{notice}</Text> : null}
        <PrimaryButton title="Sign out" icon="log-out-outline" onPress={signOut} />
      </ScrollView>
      <TabBar active="profile" onNavigate={enter} />
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={[styles.safeArea, styles.homeSafeArea]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.mainShell}>
        <ScrollView contentContainerStyle={styles.homeScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.homeOrangeHeader}>
            <View style={styles.homeHeaderRow}>
              <View style={styles.homeDeliveryBlock}>
                <Text style={styles.homeDeliveryLabel}>DELIVERING TO</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Detect your current location" onPress={() => enter('location')} style={styles.homeDeliveryButton}>
                  <Ionicons name="location" size={16} color={palette.card} />
                  <Text numberOfLines={1} style={styles.homeDeliveryValue}>{locationState === 'granted' ? place || 'Current location' : 'Find nearby shops'}</Text>
                  <Ionicons name="chevron-down" size={15} color={palette.card} />
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => enter('profile')} style={styles.homeProfileButton}><Ionicons name="person-outline" size={20} color={palette.forest} /></Pressable>
            </View>
            <View style={styles.homeSearchBar}>
              <Ionicons name="search" size={18} color={palette.muted} />
              <TextInput accessibilityLabel="Search local shops and categories" value={searchQuery} onChangeText={setSearchQuery} placeholder="Search milk, chips, bread" placeholderTextColor="#8B9199" returnKeyType="search" style={styles.homeSearchInput} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCategoryRow}>
              {['All', 'Snacks', 'Drinks', 'Bakery', 'Dairy'].map(category => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: selectedCategory === category }} onPress={() => setSelectedCategory(category)} style={[styles.quickCategory, selectedCategory === category && styles.quickCategoryActive]}><Text style={[styles.quickCategoryText, selectedCategory === category && styles.quickCategoryTextActive]}>{category}</Text></Pressable>)}
            </ScrollView>
          </View>
          <View style={styles.homeContent}>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Categories</Text><Text style={styles.sectionSub}>Find what you need from local shops</Text></View><Pressable accessibilityRole="button" onPress={() => setSelectedCategory('All')}><Text style={styles.seeAllText}>See all</Text></Pressable></View>
            <View style={styles.categoryGrid}>
              {categories.map(category => <Pressable key={category.name} accessibilityRole="button" accessibilityState={{ selected: selectedCategory === category.name }} onPress={() => setSelectedCategory(category.name)} style={[styles.categoryTile, selectedCategory === category.name && styles.categoryTileSelected]}><View style={[styles.categoryIcon, { backgroundColor: category.background }]}><Ionicons name={category.icon} size={23} color={category.tint} /></View><Text style={styles.categoryTitle}>{category.name}</Text></Pressable>)}
            </View>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Shops near you</Text><Text style={styles.sectionSub}>Local favorites, delivered nearby</Text></View></View>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="storefront-outline" size={28} color={palette.forest} /></View>
              <Text style={styles.emptyTitle}>More neighborhood shops are joining</Text>
              <Text style={styles.emptyBody}>{searchQuery ? `No live shops match “${searchQuery}” just yet.` : selectedCategory === 'All' ? 'We’ll show nearby stores here as soon as they’re available in your area.' : `Shops in ${selectedCategory} will appear here when local listings are available.`}</Text>
              <QuietButton title="Register your shop" icon="add-circle-outline" onPress={() => enter('shop')} />
            </View>
          </View>
        </ScrollView>
        <TabBar active="home" onNavigate={enter} />
      </View>
    </SafeAreaView>
  )
}

function ProfileRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.profileRow, pressed && styles.buttonDimmed]}>
      <View style={styles.profileRowIcon}><Ionicons name={icon} size={19} color={palette.forest} /></View>
      <View style={styles.profileRowCopy}><Text style={styles.profileRowTitle}>{title}</Text><Text style={styles.profileRowDetail}>{detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.paper },
  welcomeSafeArea: { backgroundColor: palette.lime },
  homeSafeArea: { backgroundColor: palette.lime },
  mainShell: { flex: 1, backgroundColor: palette.paper },
  homeScroll: { paddingBottom: 12 },
  homeOrangeHeader: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: palette.lime },
  homeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  homeDeliveryBlock: { flex: 1, minWidth: 0 },
  homeDeliveryLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  homeDeliveryButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  homeDeliveryValue: { flexShrink: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  homeProfileButton: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  homeSearchBar: { height: 47, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 13, borderRadius: 15, backgroundColor: '#FFFFFF' },
  homeSearchInput: { flex: 1, minWidth: 0, color: palette.ink, fontSize: 12 },
  quickCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 11 },
  quickCategory: { minHeight: 31, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)' },
  quickCategoryActive: { backgroundColor: '#FFFFFF' },
  quickCategoryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  quickCategoryTextActive: { color: palette.forest },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  categoryTile: { width: '31.5%', minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 17, backgroundColor: '#FFFFFF' },
  categoryTileSelected: { borderColor: palette.lime },
  categoryIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  categoryTitle: { color: palette.ink, fontSize: 9, lineHeight: 12, fontWeight: '800', textAlign: 'center' },
  seeAllText: { color: palette.forest, fontSize: 10, fontWeight: '900' },
  welcome: { flex: 1, paddingHorizontal: 25, paddingTop: 14, paddingBottom: 14, justifyContent: 'space-between' },
  welcomeOrange: { backgroundColor: palette.lime },
  welcomeLogoCard: { width: 244, height: 122, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 28, borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF', elevation: 5, shadowColor: palette.leaf, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  welcomeLogo: { width: 224, height: 102 },
  welcomeLogoFallback: { color: palette.leaf, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  welcomeBrandTitle: { color: '#FFFFFF', fontSize: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 18 },
  welcomeTagline: { maxWidth: 250, color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  welcomeTop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFF' },
  welcomeButtonText: { color: palette.forest, fontSize: 14, fontWeight: '900' },
  welcomeBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: palette.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.7 },
  welcomeGraphic: { height: 124, alignItems: 'center', justifyContent: 'center', marginTop: 9, marginBottom: 11 },
  graphicOrbit: { position: 'absolute', height: 116, width: 116, borderRadius: 58, backgroundColor: palette.softGreen, borderWidth: 1, borderColor: '#DFE9DE' },
  graphicCenter: { width: 78, height: 78, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: palette.ink, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  graphicBadge: { position: 'absolute', right: 55, bottom: 22, width: 39, height: 39, borderRadius: 14, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  graphicDot: { position: 'absolute', left: 63, top: 35, width: 12, height: 12, borderRadius: 6, backgroundColor: palette.saffron },
  welcomeCopy: { marginTop: 3 },
  eyebrow: { color: palette.leaf, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10 },
  welcomeTitle: { color: palette.ink, fontSize: 32, lineHeight: 35, fontWeight: '900', letterSpacing: -1.1 },
  welcomeDescription: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 10, maxWidth: 290 },
  welcomeActions: { gap: 12, paddingTop: 20 },
  privacyNote: { color: 'rgba(255,255,255,0.82)', fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12 },
  primaryButton: { minHeight: 54, paddingHorizontal: 18, borderRadius: 17, backgroundColor: palette.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { color: palette.card, fontSize: 14, fontWeight: '900', letterSpacing: 0.1 },
  buttonDimmed: { opacity: 0.65, transform: [{ scale: 0.985 }] },
  quietButton: { minHeight: 46, paddingHorizontal: 13, borderRadius: 14, backgroundColor: palette.softGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quietButtonText: { color: palette.leaf, fontSize: 12, fontWeight: '800' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 19, paddingVertical: 8 },
  headerTitle: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '900' },
  headerSpacer: { width: 44 },
  iconButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  screenBody: { flex: 1, paddingHorizontal: 22, paddingTop: 12 },
  roleBody: { flexGrow: 1, paddingBottom: 12 },
  locationBody: { paddingBottom: 20 },
  pageTitle: { color: palette.ink, fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -0.9, marginTop: 4 },
  bodyText: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 16 },
  locationIllustration: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  locationOrbit: { position: 'absolute', width: 108, height: 108, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D7B69B', borderRadius: 54 },
  locationOrbitInner: { position: 'absolute', width: 82, height: 82, borderWidth: 1, borderColor: '#E8D8C7', borderRadius: 41 },
  locationOrbitDot: { position: 'absolute', top: -5, left: 48, width: 11, height: 11, borderRadius: 6, backgroundColor: palette.lime, borderWidth: 2, borderColor: palette.paper },
  locationOrbitDotInner: { position: 'absolute', bottom: 3, left: 35, width: 8, height: 8, borderRadius: 4, backgroundColor: palette.leaf, borderWidth: 2, borderColor: palette.paper },
  locationPin: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: palette.lime, elevation: 4, shadowColor: palette.leaf, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  locationStatusCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card },
  locationStatusIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.softGreen },
  locationStatusCopy: { flex: 1 },
  locationStatusTitle: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  locationStatusArea: { color: palette.forest, fontSize: 10, fontWeight: '800', marginTop: 3 },
  locationStatusMessage: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  permissionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, marginBottom: 8 },
  permissionText: { flex: 1, color: palette.muted, fontSize: 11, lineHeight: 16 },
  fieldWrap: { marginTop: 11 },
  fieldHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginBottom: 3 },
  fieldLabel: { color: palette.ink, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  field: { minHeight: 48, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, fontSize: 13, color: palette.ink },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.softGreen, marginTop: 12 },
  noticeText: { flex: 1, color: palette.ink, fontSize: 11, lineHeight: 16 },
  flexSpacer: { flex: 1, minHeight: 16 },
  roleCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginTop: 9, borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line },
  roleCardSelected: { backgroundColor: palette.softGreen, borderColor: palette.leaf },
  roleIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFF7EE', alignItems: 'center', justifyContent: 'center' },
  roleIconSelected: { backgroundColor: palette.lime },
  roleCopy: { flex: 1 },
  roleName: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  roleDescription: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  previewLinks: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 18 },
  previewLink: { minHeight: 39, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, backgroundColor: palette.softGreen },
  previewLinkText: { color: palette.leaf, fontSize: 9, fontWeight: '800' },
  formBody: { paddingHorizontal: 21, paddingTop: 16, paddingBottom: 25 },
  alertText: { color: palette.danger, fontSize: 12, lineHeight: 17, marginTop: 11, textAlign: 'center' },
  mainBody: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 23, paddingBottom: 25 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: palette.softGreen, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  tabBar: { minHeight: 66, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 4 },
  tabItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: palette.forest, fontWeight: '900' },
  homeContent: { paddingHorizontal: 18, paddingBottom: 18 },
  locationPill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 16, paddingHorizontal: 12 },
  locationPillCopy: { flex: 1 },
  locationPillLabel: { color: palette.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  locationPillValue: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: 2 },
  homeHero: { marginTop: 14, padding: 17, minHeight: 218, borderRadius: 24, backgroundColor: palette.forest, overflow: 'hidden' },
  heroDecor: { position: 'absolute', top: -24, right: -16, width: 132, height: 132, borderRadius: 66, backgroundColor: '#FF923A', alignItems: 'center', justifyContent: 'center' },
  heroCircle: { width: 66, height: 66, borderRadius: 23, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  heroSpark: { position: 'absolute', left: 26, bottom: 19, width: 29, height: 29, borderRadius: 11, backgroundColor: palette.saffron, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { color: '#FFF0DD', fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginTop: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 21, lineHeight: 25, fontWeight: '900', letterSpacing: -0.6, marginTop: 7 },
  heroBody: { color: '#FFF5E9', fontSize: 11, lineHeight: 16, maxWidth: 215, marginTop: 5 },
  hubBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7, marginTop: 12 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#21A05D' },
  hubBadgeText: { color: '#FFFFFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.45 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 10 },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  sectionSub: { color: palette.muted, fontSize: 10, marginTop: 3 },
  emptyCard: { alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line },
  emptyTitle: { color: palette.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  partnerCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 18, padding: 12 },
  partnerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.softGreen, alignItems: 'center', justifyContent: 'center' },
  partnerCopy: { flex: 1 },
  partnerTitle: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  partnerSub: { color: palette.muted, fontSize: 10, marginTop: 3 },
  profileBody: { paddingHorizontal: 19, paddingTop: 13, paddingBottom: 18 },
  profileHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, backgroundColor: palette.softGreen },
  profileAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1 },
  profileName: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  profileSub: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  profileSection: { marginTop: 19 },
  profileRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 8 },
  profileRowIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: palette.softGreen, alignItems: 'center', justifyContent: 'center' },
  profileRowCopy: { flex: 1 },
  profileRowTitle: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  profileRowDetail: { color: palette.muted, fontSize: 10, marginTop: 3 },
})
