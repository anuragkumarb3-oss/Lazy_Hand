import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'

type PartnerTab = 'orders' | 'products' | 'earnings' | 'shop' | 'trips' | 'profile'
type IconName = keyof typeof Ionicons.glyphMap

type PartnerDashboardProps = {
  kind: 'seller' | 'rider'
  onBack: () => void
}

const colors = {
  ink: '#252C37',
  muted: '#727984',
  orange: '#C2410C',
  orangeDark: '#9A3412',
  amber: '#FFB84A',
  cream: '#FAF7F2',
  white: '#FFFFFF',
  line: '#ECE6DE',
  peach: '#FFF0E2',
  green: '#159453',
  greenSoft: '#E6F5EC',
  red: '#B93832',
  redSoft: '#FDE9E7',
  blue: '#316FD1',
}

const sellerTabs: { label: string; key: PartnerTab; icon: IconName }[] = [
  { label: 'Orders', key: 'orders', icon: 'list-outline' },
  { label: 'Products', key: 'products', icon: 'cube-outline' },
  { label: 'Earnings', key: 'earnings', icon: 'wallet-outline' },
  { label: 'Shop', key: 'shop', icon: 'storefront-outline' },
]

const riderTabs: { label: string; key: PartnerTab; icon: IconName }[] = [
  { label: 'Trips', key: 'trips', icon: 'bicycle-outline' },
  { label: 'Earnings', key: 'earnings', icon: 'wallet-outline' },
  { label: 'Profile', key: 'profile', icon: 'person-outline' },
]

export default function PartnerDashboard({ kind, onBack }: PartnerDashboardProps) {
  const isSeller = kind === 'seller'
  const tabs = isSeller ? sellerTabs : riderTabs
  const [activeTab, setActiveTab] = useState<PartnerTab>(isSeller ? 'orders' : 'trips')
  const [isOpen, setIsOpen] = useState(true)
  const [notice, setNotice] = useState('')

  const showPreviewNotice = (message: string) => setNotice(`${message} This preview is not connected to live orders or payments.`)

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to role selection" onPress={onBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={19} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{isSeller ? 'Seller app' : 'Rider app'}</Text>
          <Text style={styles.headerSubtitle}>{isSeller ? 'Gupta Kirana Store' : 'Delivery partner'}</Text>
        </View>
        <View style={styles.previewPill}><Text style={styles.previewPillText}>PREVIEW</Text></View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.previewNotice}>
          <Ionicons name="eye-outline" size={15} color={colors.orangeDark} />
          <Text style={styles.previewNoticeText}>Sample screen content · actions are not live</Text>
        </View>

        {isSeller ? (
          <>
            <View style={styles.sellerHero}>
              <View style={styles.heroTopline}><Text style={styles.heroEyebrow}>NAMASTE, GUPTA JI</Text><View style={styles.shopIcon}><Ionicons name="storefront" size={18} color={colors.orangeDark} /></View></View>
              <Text style={styles.heroTitle}>Gupta Kirana Store</Text>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: isOpen }} onPress={() => setIsOpen(value => !value)} style={[styles.openStatus, !isOpen && styles.closedStatus]}>
                <View style={[styles.statusDot, !isOpen && styles.statusDotClosed]} />
                <View style={styles.openCopy}><Text style={styles.openTitle}>{isOpen ? 'Shop is OPEN' : 'Shop is CLOSED'}</Text><Text style={styles.openSubtitle}>Manual preview toggle · 07:00 AM–10:00 PM</Text></View>
                <View style={[styles.switchTrack, isOpen && styles.switchTrackOn]}><View style={[styles.switchThumb, isOpen && styles.switchThumbOn]} /></View>
              </Pressable>
            </View>
            {activeTab === 'orders' ? <SellerOrders onAction={() => showPreviewNotice('Order acceptance is a visual demo.')} /> : null}
            {activeTab === 'products' ? <SellerProducts onAction={() => showPreviewNotice('Product editing is a visual demo.')} /> : null}
            {activeTab === 'earnings' ? <SellerEarnings /> : null}
            {activeTab === 'shop' ? <SellerSettings isOpen={isOpen} onToggle={() => setIsOpen(value => !value)} onAction={() => showPreviewNotice('Shop settings are a visual demo.')} /> : null}
          </>
        ) : (
          <>
            <View style={styles.riderHero}>
              <View style={styles.riderHeroTop}><View><Text style={styles.heroEyebrow}>DELIVERY PARTNER</Text><Text style={styles.heroTitle}>Your neighborhood,{ '\n' }on two wheels.</Text></View><View style={styles.riderIcon}><Ionicons name="bicycle" size={24} color={colors.orangeDark} /></View></View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: isOpen }} onPress={() => setIsOpen(value => !value)} style={styles.onlineRow}>
                <View style={[styles.statusDot, !isOpen && styles.statusDotClosed]} />
                <View style={styles.openCopy}><Text style={styles.openTitle}>{isOpen ? 'You are ONLINE' : 'You are OFFLINE'}</Text><Text style={styles.openSubtitle}>GPS and trip dispatch are preview-only</Text></View>
                <View style={[styles.switchTrack, isOpen && styles.switchTrackOn]}><View style={[styles.switchThumb, isOpen && styles.switchThumbOn]} /></View>
              </Pressable>
            </View>
            {activeTab === 'trips' ? <RiderTrips online={isOpen} onAction={() => showPreviewNotice('Trip dispatch is a visual demo.')} /> : null}
            {activeTab === 'earnings' ? <RiderEarnings /> : null}
            {activeTab === 'profile' ? <RiderProfile onAction={() => showPreviewNotice('Rider profile setup is a visual demo.')} /> : null}
          </>
        )}
        {notice ? <Text accessibilityRole="alert" style={styles.actionNotice}>{notice}</Text> : null}
      </ScrollView>

      <View accessibilityRole="tablist" style={styles.tabBar}>
        {tabs.map(tab => {
          const selected = activeTab === tab.key
          return (
            <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setActiveTab(tab.key); setNotice('') }} style={styles.tabItem}>
              <Ionicons name={tab.icon} size={20} color={selected ? colors.orange : colors.muted} />
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDetail}>{detail}</Text></View><Ionicons name="ellipsis-horizontal" size={19} color={colors.muted} /></View>
}

function SellerOrders({ onAction }: { onAction: () => void }) {
  return (
    <>
      <View style={styles.metricRow}>
        <Metric value="18" label="Orders today" />
        <Metric value="₹2,840" label="Sales today" />
        <Metric value="2" label="Pending" highlight />
      </View>
      <SectionTitle title="New orders" detail="Illustrative order cards" />
      <OrderCard number="LH2483" time="2 min ago" total="₹213" items="3 items · Rampur, Ward 4" onAction={onAction} />
      <OrderCard number="LH2484" time="5 min ago" total="Review" items="Handwritten list · Madhopur" onAction={onAction} />
      <SectionTitle title="Today at a glance" detail="Sample preview values" />
      <View style={styles.infoCard}><InfoRow label="Accepted orders" value="16" /><InfoRow label="Ready to pack" value="2" /><InfoRow label="Shop status" value="Open" accent /></View>
    </>
  )
}

function SellerProducts({ onAction }: { onAction: () => void }) {
  return (
    <>
      <SectionTitle title="My products" detail="Sample catalog · 5 items" />
      {[
        ['Aashirvaad Atta 5 kg', '₹260 · In stock', 'nutrition'],
        ['Amul Toned Milk 500 ml', '₹28 · In stock', 'water'],
        ['Maggi Noodles 70 g', '₹14 · In stock', 'restaurant'],
        ['Farm Eggs (6)', '₹54 · Out of stock', 'egg'],
        ['Tata Salt 1 kg', '₹28 · In stock', 'cube'],
      ].map(([name, detail, icon]) => <View key={name} style={styles.productRow}><View style={styles.productIcon}><Ionicons name={icon as IconName} size={19} color={colors.orangeDark} /></View><View style={styles.productCopy}><Text style={styles.productName}>{name}</Text><Text style={styles.productDetail}>{detail}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} /></View>)}
      <ActionButton title="Add a product" onPress={onAction} />
    </>
  )
}

function SellerEarnings() {
  return (
    <>
      <SectionTitle title="Earnings" detail="Settlement preview · not real payout data" />
      <View style={styles.earningsHero}><Text style={styles.earningsEyebrow}>TODAY'S NET PAYOUT</Text><Text style={styles.earningsValue}>₹2,459</Text><Text style={styles.earningsFoot}>Settlement schedule is not connected</Text></View>
      <View style={styles.infoCard}><Text style={styles.cardHeading}>Breakdown</Text><InfoRow label="Delivered item value" value="₹2,840" /><InfoRow label="Platform fees" value="−₹39" negative /><InfoRow label="Commission" value="−₹342" negative /><View style={styles.divider} /><InfoRow label="Net payout" value="₹2,459" accent /></View>
      <SectionTitle title="Recent orders" detail="Example earnings" />
      <View style={styles.infoCard}><InfoRow label="#LH2483 · Self delivery" value="+₹210" accent /><InfoRow label="#LH2480 · Rider delivery" value="+₹447" accent /></View>
    </>
  )
}

function SellerSettings({ isOpen, onToggle, onAction }: { isOpen: boolean; onToggle: () => void; onAction: () => void }) {
  return (
    <>
      <SectionTitle title="Shop settings" detail="Changes are local to this preview" />
      <View style={styles.infoCard}>
        <SettingRow title="Shop is open" detail="Pause orders any time" value={isOpen} onPress={onToggle} />
        <View style={styles.divider} />
        <InfoRow label="Opens at" value="07:00 AM" /><InfoRow label="Closes at" value="10:00 PM" /><InfoRow label="Category" value="Kirana" />
      </View>
      <View style={styles.infoCard}><Text style={styles.cardHeading}>Order preferences</Text><SettingRow title="New order alerts" detail="Device notification preview" value onPress={onAction} /></View>
    </>
  )
}

function RiderTrips({ online, onAction }: { online: boolean; onAction: () => void }) {
  return (
    <>
      <View style={styles.metricRow}><Metric value="9" label="Trips today" /><Metric value="₹180" label="Earned" /><Metric value="₹1,240" label="Cash held" /></View>
      <SectionTitle title="Nearby trip requests" detail={online ? 'Sample requests · not dispatching' : 'Go online to preview requests'} />
      {online ? <>
        <TripCard shop="Gupta Kirana Store" distance="1.4 km" address="Rampur, Ward 4 · Near Shiv Mandir" onAction={onAction} />
        <TripCard shop="Sharma Sweets & Dairy" distance="2.1 km" address="Madhopur · Hanuman Chowk" onAction={onAction} />
      </> : <View style={styles.emptyCard}><Ionicons name="moon-outline" size={24} color={colors.orange} /><Text style={styles.emptyTitle}>You are offline</Text><Text style={styles.emptyDetail}>Switch to online to preview nearby trip cards.</Text></View>}
    </>
  )
}

function RiderEarnings() {
  return (
    <>
      <SectionTitle title="Earnings" detail="Settlement preview · no real payouts" />
      <View style={styles.earningsHero}><Text style={styles.earningsEyebrow}>CASH TO PAY ADMIN</Text><Text style={styles.earningsValue}>₹1,060</Text><Text style={styles.earningsFoot}>Example cash collected: ₹1,240 · trips: 9</Text></View>
      <View style={styles.infoCard}><Text style={styles.cardHeading}>Today's summary</Text><InfoRow label="Trips completed" value="9" /><InfoRow label="Earned (9 × ₹20)" value="₹180" accent /><InfoRow label="COD collected" value="₹1,240" /><View style={styles.divider} /><InfoRow label="Net cash to admin" value="₹1,060" accent /></View>
      <View style={styles.previewNotice}><Text style={styles.previewNoticeText}>Settlement actions are unavailable in this frontend preview</Text></View>
    </>
  )
}

function RiderProfile({ onAction }: { onAction: () => void }) {
  return (
    <>
      <View style={styles.profileCard}><View style={styles.profileAvatar}><Ionicons name="person" size={24} color={colors.orangeDark} /></View><View style={styles.productCopy}><Text style={styles.productName}>Delivery partner</Text><Text style={styles.productDetail}>Preview profile · not registered</Text></View></View>
      <SectionTitle title="Your details" detail="Set up after rider onboarding" />
      <View style={styles.infoCard}><ProfileRow title="Vehicle details" value="Not added" /><ProfileRow title="Delivery area" value="845420 pilot" /><ProfileRow title="Phone verification" value="Not connected" /></View>
      <ActionButton title="Edit rider profile" onPress={onAction} />
    </>
  )
}

function Metric({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return <View style={[styles.metric, highlight && styles.metricHighlight]}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>
}

function OrderCard({ number, time, total, items, onAction }: { number: string; time: string; total: string; items: string; onAction: () => void }) {
  return <View style={styles.orderCard}><View style={styles.orderTop}><View><Text style={styles.orderNumber}>#{number} · {time}</Text><Text style={styles.orderItems}>{items}</Text></View><Text style={styles.orderTotal}>{total}</Text></View><View style={styles.orderActions}><ActionButton title="Reject" quiet onPress={onAction} /><ActionButton title="Accept & pack" onPress={onAction} /></View></View>
}

function TripCard({ shop, distance, address, onAction }: { shop: string; distance: string; address: string; onAction: () => void }) {
  return <View style={styles.tripCard}><View style={styles.tripHeading}><Text style={styles.orderNumber}>{shop}</Text><Text style={styles.distance}>{distance}</Text></View><Text style={styles.orderItems}>{address}</Text><View style={styles.tripAmounts}><View><Text style={styles.microLabel}>YOU EARN</Text><Text style={styles.tripPay}>₹20</Text></View><View style={styles.amountRight}><Text style={styles.microLabel}>COLLECT CASH (COD)</Text><Text style={styles.codAmount}>₹233</Text></View></View><ActionButton title="Accept trip" onPress={onAction} /></View>
}

function InfoRow({ label, value, accent = false, negative = false }: { label: string; value: string; accent?: boolean; negative?: boolean }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, accent && styles.infoAccent, negative && styles.infoNegative]}>{value}</Text></View>
}

function SettingRow({ title, detail, value, onPress }: { title: string; detail: string; value: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={styles.settingRow}><View style={styles.productCopy}><Text style={styles.productName}>{title}</Text><Text style={styles.productDetail}>{detail}</Text></View><View style={[styles.switchTrack, value && styles.switchTrackOn]}><View style={[styles.switchThumb, value && styles.switchThumbOn]} /></View></Pressable>
}

function ProfileRow({ title, value }: { title: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.productName}>{title}</Text><Text style={styles.productDetail}>{value}</Text></View>
}

function ActionButton({ title, onPress, quiet = false }: { title: string; onPress: () => void; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.actionButton, quiet && styles.actionButtonQuiet]}><Text style={[styles.actionButtonText, quiet && styles.actionButtonTextQuiet]}>{title}</Text></Pressable>
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  header: { minHeight: 66, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.cream },
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  headerSubtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  previewPill: { borderRadius: 20, backgroundColor: colors.peach, paddingHorizontal: 9, paddingVertical: 6 },
  previewPillText: { color: colors.orangeDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 18 },
  previewNotice: { minHeight: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.peach, borderRadius: 11, marginBottom: 12 },
  previewNoticeText: { color: colors.orangeDark, fontSize: 9, fontWeight: '800' },
  sellerHero: { borderRadius: 21, backgroundColor: colors.orange, padding: 15, marginBottom: 13 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEyebrow: { color: '#FFF4E9', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  shopIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFF8F0', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 5, letterSpacing: -0.4 },
  openStatus: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 10, marginTop: 11 },
  closedStatus: { backgroundColor: '#FFF7F3' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusDotClosed: { backgroundColor: colors.muted },
  openCopy: { flex: 1 },
  openTitle: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  openSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  switchTrack: { width: 39, height: 23, borderRadius: 12, backgroundColor: '#CBD1D9', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: colors.green },
  switchThumb: { width: 17, height: 17, borderRadius: 9, backgroundColor: colors.white },
  switchThumbOn: { alignSelf: 'flex-end' },
  riderHero: { borderRadius: 21, backgroundColor: colors.orange, padding: 15, marginBottom: 13 },
  riderHeroTop: { minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  riderIcon: { width: 53, height: 53, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  onlineRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 10 },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metric: { flex: 1, minHeight: 65, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  metricHighlight: { backgroundColor: colors.peach, borderColor: '#F9C99E' },
  metricValue: { color: colors.orangeDark, fontSize: 15, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 8, marginTop: 4 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 9 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  sectionDetail: { color: colors.muted, fontSize: 9, marginTop: 3 },
  orderCard: { backgroundColor: colors.white, borderRadius: 15, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: colors.line },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  orderNumber: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  orderItems: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  orderTotal: { color: colors.orangeDark, fontSize: 13, fontWeight: '900' },
  orderActions: { flexDirection: 'row', gap: 7, marginTop: 8 },
  actionButton: { minHeight: 38, flex: 1, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionButtonQuiet: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  actionButtonText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  actionButtonTextQuiet: { color: colors.muted },
  infoCard: { backgroundColor: colors.white, borderRadius: 15, padding: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  cardHeading: { color: colors.ink, fontSize: 11, fontWeight: '900', marginBottom: 5 },
  infoRow: { minHeight: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  infoLabel: { color: colors.muted, fontSize: 10, flex: 1 },
  infoValue: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  infoAccent: { color: colors.green },
  infoNegative: { color: colors.red },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
  productRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  productIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1 },
  productName: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  productDetail: { color: colors.muted, fontSize: 8, marginTop: 3 },
  earningsHero: { padding: 15, borderRadius: 19, backgroundColor: colors.orange, marginBottom: 11 },
  earningsEyebrow: { color: '#FFF3E6', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  earningsValue: { color: colors.white, fontSize: 26, fontWeight: '900', marginTop: 5 },
  earningsFoot: { color: '#FFF8F1', fontSize: 9, marginTop: 4 },
  settingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  profileAvatar: { width: 47, height: 47, borderRadius: 16, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  tripCard: { backgroundColor: colors.white, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  tripHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distance: { color: colors.orangeDark, fontSize: 9, fontWeight: '900' },
  tripAmounts: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, marginTop: 9, marginBottom: 7, paddingTop: 8 },
  microLabel: { color: colors.muted, fontSize: 7, fontWeight: '800' },
  tripPay: { color: colors.green, fontSize: 15, fontWeight: '900', marginTop: 2 },
  amountRight: { alignItems: 'flex-end' },
  codAmount: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 2 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 8 },
  emptyDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
  actionNotice: { color: colors.orangeDark, fontSize: 10, lineHeight: 15, backgroundColor: colors.peach, borderRadius: 11, padding: 10, marginTop: 2 },
  tabBar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 4 },
  tabItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  tabTextActive: { color: colors.orange, fontWeight: '900' },
})
