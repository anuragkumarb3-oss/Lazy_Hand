import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

type ShoppingListItem = { id: string; name: string; done: boolean }

const ITEMS_KEY = 'lazyhand-shopping-list-v1'
const TIME_KEY = 'lazyhand-shopping-list-reminder-time-v1'
const ENABLED_KEY = 'lazyhand-shopping-list-reminder-enabled-v1'
const NOTIFICATION_ID_KEY = 'lazyhand-shopping-list-reminder-id-v1'
const DAILY_CHANNEL_ID = 'daily-shopping-list'

async function getNativeNotifications() {
  const notifications = await import('expo-notifications')
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
  return notifications
}

const colors = {
  ink: '#252C37',
  brand: '#C2410C',
  brandDeep: '#9A3412',
  paper: '#FAF7F2',
  white: '#FFFFFF',
  muted: '#727984',
  line: '#ECE6DE',
  peach: '#FFF0E2',
  green: '#15803D',
  red: '#B93832',
}

function reminderBody(items: ShoppingListItem[]) {
  const pending = items.filter(item => !item.done)
  if (!pending.length) return 'Your list is all checked off. Add anything you need for tomorrow.'
  const names = pending.slice(0, 3).map(item => item.name).join(', ')
  const remaining = pending.length - 3
  return `Remember ${names}${remaining > 0 ? ` and ${remaining} more` : ''} on your shopping list.`
}

async function requestReminderPermission() {
  if (Platform.OS === 'web') return false
  const Notifications = await getNativeNotifications()

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
      name: 'Daily shopping-list reminder',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: colors.brand,
    })
  }

  const permission = await Notifications.requestPermissionsAsync()
  return permission.granted || permission.status === 'granted'
}

function ReminderRow({ item, onToggle, onRemove }: { item: ShoppingListItem; onToggle: () => void; onRemove: () => void }) {
  const scale = useRef(new Animated.Value(1)).current

  const toggle = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.94, useNativeDriver: Platform.OS !== 'web', speed: 30, bounciness: 5 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 24, bounciness: 6 }),
    ]).start()
    onToggle()
  }

  return (
    <Animated.View style={[styles.listRow, { transform: [{ scale }] }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} aria-checked={item.done} onPress={toggle} style={styles.checkButton}>
        <View style={[styles.checkbox, item.done && styles.checkboxChecked]}>
          {item.done ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
        </View>
        <Text style={[styles.itemName, item.done && styles.itemNameDone]}>{item.name}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={onRemove} hitSlop={8} style={styles.removeButton}>
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  )
}

export default function ShoppingListScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [draft, setDraft] = useState('')
  const [reminderTime, setReminderTime] = useState('08:00')
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const notificationId = useRef<string | null>(null)
  const revision = useRef(0)

  useEffect(() => {
    let active = true
    void Promise.all([
      AsyncStorage.getItem(ITEMS_KEY),
      AsyncStorage.getItem(TIME_KEY),
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(NOTIFICATION_ID_KEY),
    ]).then(([savedItems, savedTime, savedEnabled, savedNotificationId]) => {
      if (!active) return
      if (savedItems) {
        try {
          const parsed = JSON.parse(savedItems)
          if (Array.isArray(parsed)) setItems(parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.done === 'boolean'))
        } catch {
          setItems([])
        }
      }
      if (savedTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(savedTime)) setReminderTime(savedTime)
      setReminderEnabled(savedEnabled === 'true')
      notificationId.current = savedNotificationId
      setReady(true)
    }).catch(() => {
      if (active) {
        setMessage('Your list could not be loaded. Try reopening this screen.')
        setReady(true)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    void Promise.all([
      AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items)),
      AsyncStorage.setItem(TIME_KEY, reminderTime),
      AsyncStorage.setItem(ENABLED_KEY, String(reminderEnabled)),
    ]).catch(() => setMessage('Your changes could not be saved on this device.'))
  }, [items, ready, reminderEnabled, reminderTime])

  useEffect(() => {
    if (ready && !items.length && reminderEnabled) {
      setReminderEnabled(false)
      setMessage('Add an item to keep your daily reminder active.')
    }
  }, [items.length, ready, reminderEnabled])

  useEffect(() => {
    if (!ready) return
    const currentRevision = ++revision.current
    let cancelled = false

    const synchronizeReminder = async () => {
      const Notifications = Platform.OS === 'web' ? null : await getNativeNotifications()
      const previousId = notificationId.current
      notificationId.current = null
      if (previousId && Notifications) await Notifications.cancelScheduledNotificationAsync(previousId).catch(() => undefined)
      if (cancelled || currentRevision !== revision.current || !reminderEnabled || !items.length || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(reminderTime) || !Notifications) {
        if (!reminderEnabled || !items.length) await AsyncStorage.removeItem(NOTIFICATION_ID_KEY).catch(() => undefined)
        return
      }

      const body = reminderBody(items)
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your LazyHand shopping list',
          body,
          sound: 'default',
          data: { screen: 'shopping-list' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Number(reminderTime.slice(0, 2)),
          minute: Number(reminderTime.slice(3, 5)),
          channelId: DAILY_CHANNEL_ID,
        },
      })
      if (cancelled || currentRevision !== revision.current) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)
        return
      }
      notificationId.current = id
      await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id).catch(() => undefined)
    }

    void synchronizeReminder().catch(() => {
      if (!cancelled) setMessage('We could not update your daily reminder. Check notification permissions and try again.')
    })
    return () => { cancelled = true }
  }, [items, ready, reminderEnabled, reminderTime])

  const addItem = () => {
    const name = draft.trim()
    if (!name) return
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setItems(current => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, done: false }])
    setDraft('')
    setMessage('Added to your daily list.')
  }

  const toggleItem = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setItems(current => current.map(item => item.id === id ? { ...item, done: !item.done } : item))
  }

  const removeItem = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setItems(current => current.filter(item => item.id !== id))
  }

  const toggleReminder = async () => {
    if (reminderEnabled) {
      setReminderEnabled(false)
      setMessage('Daily reminders are off.')
      return
    }
    if (Platform.OS === 'web') {
      setMessage('Daily notifications are available in the iOS and Android app. This browser preview cannot deliver reminders while closed.')
      return
    }
    if (!items.length) {
      setMessage('Add at least one item before turning on a daily reminder.')
      return
    }
    try {
      const granted = await requestReminderPermission()
      if (!granted) {
        setMessage('Notifications are blocked. Allow them in your device settings, then try again.')
        return
      }
      setReminderEnabled(true)
      setMessage('Daily reminder set. It will arrive even when LazyHand is closed.')
    } catch {
      setMessage('Notifications are not available on this device.')
    }
  }

  const completed = items.filter(item => item.done).length
  const timeIsValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>My daily list</Text>
          <Text style={styles.headerSubtitle}>{items.length ? `${completed} of ${items.length} checked` : 'Keep essentials close at hand'}</Text>
        </View>
        <View style={styles.headerIcon}><Ionicons name="list" size={19} color={colors.brandDeep} /></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.introCard}>
          <View style={styles.introIcon}><Ionicons name="basket-outline" size={23} color={colors.brandDeep} /></View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>The little things you run out of</Text>
            <Text style={styles.introBody}>Add your essentials. Your list stays on this device, and the daily reminder calls out what is still unchecked.</Text>
          </View>
        </View>

        <View style={styles.addRow}>
          <TextInput
            accessibilityLabel="Shopping list item"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add milk, bread, atta…"
            placeholderTextColor="#9AA59F"
            returnKeyType="done"
            maxLength={60}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" onPress={addItem} disabled={!draft.trim()} style={[styles.addButton, !draft.trim() && styles.addButtonDisabled]}>
            <Ionicons name="add" size={21} color={colors.white} />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.listCard}>
          {items.length ? items.map(item => (
            <ReminderRow key={item.id} item={item} onToggle={() => toggleItem(item.id)} onRemove={() => removeItem(item.id)} />
          )) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="list-outline" size={24} color={colors.brandDeep} /></View>
              <Text style={styles.emptyTitle}>Your list is ready</Text>
              <Text style={styles.emptyBody}>Add a few everyday essentials to get started.</Text>
            </View>
          )}
        </View>

        <View style={styles.reminderCard}>
          <View style={styles.reminderHeading}>
            <View style={styles.reminderIcon}><Ionicons name="notifications-outline" size={18} color={colors.brandDeep} /></View>
            <View style={styles.reminderCopy}>
              <Text style={styles.reminderTitle}>Daily list reminder</Text>
              <Text style={styles.reminderDescription}>A gentle nudge with unchecked items</Text>
            </View>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminderEnabled, disabled: !items.length || (!timeIsValid && !reminderEnabled) }} aria-checked={reminderEnabled} aria-label="Daily shopping-list reminder" disabled={!items.length || (!timeIsValid && !reminderEnabled)} onPress={() => void toggleReminder()} style={[styles.switch, reminderEnabled && styles.switchOn, (!items.length || (!timeIsValid && !reminderEnabled)) && styles.switchDisabled]}>
              <View style={[styles.switchKnob, reminderEnabled && styles.switchKnobOn]} />
            </Pressable>
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Every day at</Text>
            <TextInput
              accessibilityLabel="Daily reminder time in 24-hour format"
              value={reminderTime}
              onChangeText={value => { setReminderTime(value); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) setMessage('Use 24-hour time, for example 08:30.') }}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              placeholder="08:00"
              style={[styles.timeInput, !timeIsValid && styles.timeInputInvalid]}
            />
          </View>
          <Text style={styles.timeHint}>{Platform.OS === 'web' ? 'Daily reminders are available in the iOS and Android app.' : 'Your phone will deliver this reminder even when the app is closed.'}</Text>
        </View>

        {message ? <Text accessibilityRole="status" style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  headerSubtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.peach },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 13, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },
  introCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 18, backgroundColor: colors.peach },
  introIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.white },
  introCopy: { flex: 1 },
  introTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  introBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white, paddingHorizontal: 13, color: colors.ink, fontSize: 13 },
  addButton: { minWidth: 82, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, backgroundColor: colors.brand },
  addButtonDisabled: { opacity: 0.55 },
  addButtonText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  listCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white },
  listRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, paddingLeft: 13, paddingRight: 8 },
  checkButton: { flex: 1, minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#CFC8BE', borderRadius: 7, backgroundColor: colors.white },
  checkboxChecked: { borderColor: colors.green, backgroundColor: colors.green },
  itemName: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  itemNameDone: { color: colors.muted, textDecorationLine: 'line-through' },
  removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  emptyIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.peach },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 10 },
  emptyBody: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 4 },
  reminderCard: { padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white },
  reminderHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.peach },
  reminderCopy: { flex: 1 },
  reminderTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  reminderDescription: { color: colors.muted, fontSize: 10, marginTop: 2 },
  switch: { width: 44, height: 26, justifyContent: 'center', borderRadius: 20, backgroundColor: '#D6D3CE', padding: 3 },
  switchOn: { backgroundColor: colors.green },
  switchDisabled: { opacity: 0.48 },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, elevation: 1 },
  switchKnobOn: { alignSelf: 'flex-end' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 },
  timeLabel: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  timeInput: { minWidth: 76, height: 36, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper, paddingHorizontal: 9, color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  timeInputInvalid: { borderColor: colors.red },
  timeHint: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 8 },
  message: { color: colors.brandDeep, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
})
