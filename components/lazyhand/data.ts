import {
  Carrot,
  Cookie,
  Croissant,
  CupSoda,
  Egg,
  IceCreamCone,
  Milk,
  Soup,
  Wheat,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'customer' | 'shopkeeper' | 'rider'

export type CategoryId = 'snacks' | 'drinks' | 'bakery' | 'icecream' | 'veg' | 'dairy' | 'staples' | 'instant' | 'eggs'

export type Category = { id: CategoryId; name: string; short: string; Icon: LucideIcon; tone: string }

export const categories: Category[] = [
  { id: 'snacks', name: 'Chips & Namkeen', short: 'Chips', Icon: Cookie, tone: 'bg-[#FFF3D6] text-[#C2410C]' },
  { id: 'drinks', name: 'Drinks & Juices', short: 'Drinks', Icon: CupSoda, tone: 'bg-[#FFE9D6] text-[#C2410C]' },
  { id: 'bakery', name: 'Bakery & Biscuits', short: 'Bakery', Icon: Croissant, tone: 'bg-[#FDE8DA] text-[#B45309]' },
  { id: 'icecream', name: 'Ice Creams & More', short: 'Ice cream', Icon: IceCreamCone, tone: 'bg-[#FCE7F1] text-[#DB2777]' },
  { id: 'veg', name: 'Vegetables & Fruits', short: 'Veg & Fruit', Icon: Carrot, tone: 'bg-[#E3F6EA] text-[#15803D]' },
  { id: 'dairy', name: 'Dairy & Bread', short: 'Dairy', Icon: Milk, tone: 'bg-[#E4EDFF] text-[#2563EB]' },
  { id: 'staples', name: 'Atta, Rice & Dal', short: 'Staples', Icon: Wheat, tone: 'bg-[#FFF3D6] text-[#A16207]' },
  { id: 'instant', name: 'Instant Food', short: 'Instant', Icon: Soup, tone: 'bg-[#FFF3D6] text-[#C2410C]' },
  { id: 'eggs', name: 'Eggs', short: 'Eggs', Icon: Egg, tone: 'bg-[#FFF7E0] text-[#A16207]' },
]

export const categoryById = Object.fromEntries(categories.map(c => [c.id, c])) as Record<CategoryId, Category>

export type Shop = {
  id: string
  name: string
  kind: string
  hours: string
  opensAt: string
  rating: number
  eta: string
  open: boolean
}

export const seedShops: Shop[] = [
  { id: 'gupta', name: 'Gupta Kirana Store', kind: 'Kirana', hours: '7 AM – 10 PM', opensAt: '7 AM', rating: 4.6, eta: '15–20 min', open: true },
  { id: 'raj', name: 'Raj General Store', kind: 'General store', hours: '8 AM – 9 PM', opensAt: '8 AM', rating: 4.4, eta: '20–25 min', open: true },
  { id: 'sharma', name: 'Sharma Sweets & Dairy', kind: 'Dairy & Sweets', hours: '8 AM – 8 PM', opensAt: '8 AM', rating: 4.7, eta: '15 min', open: false },
]

export type Product = {
  id: string
  shopId: string
  name: string
  unit: string
  price: number
  category: CategoryId
  inStock: boolean
  stock?: number
  featured?: boolean
  imageUrl?: string
  demoOnly?: boolean
}

export const seedProducts: Product[] = [
  { id: 'p1', shopId: 'gupta', name: 'Maggi 2-Min Noodles', unit: '70 g', price: 14, category: 'instant', inStock: true },
  { id: 'p2', shopId: 'gupta', name: 'Amul Toned Milk', unit: '500 ml', price: 28, category: 'dairy', inStock: true },
  { id: 'p3', shopId: 'gupta', name: 'Britannia Bread', unit: '400 g', price: 45, category: 'bakery', inStock: true },
  { id: 'p4', shopId: 'gupta', name: 'Farm Eggs (6)', unit: '6 pcs', price: 54, category: 'eggs', inStock: true },
  { id: 'p5', shopId: 'gupta', name: 'Lays Magic Masala', unit: '52 g', price: 20, category: 'snacks', inStock: true },
  { id: 'p6', shopId: 'gupta', name: 'Salted Peanuts', unit: '150 g', price: 30, category: 'snacks', inStock: true },
  { id: 'p7', shopId: 'gupta', name: 'Aashirvaad Atta', unit: '5 kg', price: 245, category: 'staples', inStock: true },
  { id: 'p8', shopId: 'gupta', name: 'Frooti Mango', unit: '200 ml', price: 15, category: 'drinks', inStock: true },
  { id: 'p9', shopId: 'raj', name: 'Toor Dal', unit: '1 kg', price: 165, category: 'staples', inStock: true },
  { id: 'p10', shopId: 'raj', name: 'Sugar', unit: '1 kg', price: 48, category: 'staples', inStock: true },
  { id: 'p11', shopId: 'raj', name: 'Popcorn Butter', unit: '90 g', price: 45, category: 'snacks', inStock: true },
  { id: 'p12', shopId: 'raj', name: 'Fresh Tomatoes', unit: '500 g', price: 25, category: 'veg', inStock: true },
  { id: 'p13', shopId: 'raj', name: 'Onions', unit: '1 kg', price: 40, category: 'veg', inStock: true },
  { id: 'p14', shopId: 'raj', name: 'Thums Up', unit: '750 ml', price: 40, category: 'drinks', inStock: true },
  { id: 'p15', shopId: 'sharma', name: 'Haldiram Bhujia Sev', unit: '200 g', price: 55, category: 'snacks', inStock: true },
  { id: 'p16', shopId: 'sharma', name: 'Fresh Paneer', unit: '200 g', price: 90, category: 'dairy', inStock: true },
  { id: 'p17', shopId: 'sharma', name: 'Curd', unit: '400 g', price: 35, category: 'dairy', inStock: true },
  { id: 'p18', shopId: 'sharma', name: 'Kulfi Stick', unit: '1 pc', price: 25, category: 'icecream', inStock: true },
  { id: 'p19', shopId: 'gupta', name: 'Premium Basmati Rice', unit: '1 kg', price: 149, category: 'staples', inStock: true, featured: true },
  { id: 'p20', shopId: 'gupta', name: 'Raw Forest Honey', unit: '250 g', price: 129, category: 'staples', inStock: true },
  { id: 'p21', shopId: 'gupta', name: 'Dark Chocolate Cookies', unit: '150 g', price: 85, category: 'bakery', inStock: true, featured: true },
  { id: 'p22', shopId: 'gupta', name: 'Roasted Almonds', unit: '100 g', price: 110, category: 'snacks', inStock: true, featured: true },
  { id: 'p23', shopId: 'raj', name: 'Cold-Pressed Mustard Oil', unit: '1 L', price: 189, category: 'staples', inStock: true },
  { id: 'p24', shopId: 'raj', name: 'Green Grapes', unit: '500 g', price: 75, category: 'veg', inStock: true },
  { id: 'p25', shopId: 'raj', name: 'Tender Coconut Water', unit: '200 ml', price: 35, category: 'drinks', inStock: true },
  { id: 'p26', shopId: 'sharma', name: 'Creamy Mango Lassi', unit: '250 ml', price: 45, category: 'dairy', inStock: true },
  { id: 'p27', shopId: 'sharma', name: 'Belgian Chocolate Ice Cream', unit: '500 ml', price: 175, category: 'icecream', inStock: true, featured: true },
  { id: 'p28', shopId: 'sharma', name: 'Sourdough Multigrain Loaf', unit: '400 g', price: 95, category: 'bakery', inStock: true },
]

export type OrderStatus = 'placed' | 'accepted' | 'ready' | 'picked' | 'delivered' | 'rejected'
export type Payment = 'cod' | 'upi'
export type OrderLine = { productId: string; name: string; price: number; qty: number }

export type Order = {
  id: string
  shopId: string
  lines: OrderLine[]
  itemTotal: number
  deliveryFee: number
  platformFee: number
  deliveryDistanceKm: number
  riderPayout: number
  sellerDeliveryDeduction: number
  sellerCommission: number
  sellerPayout: number
  total: number
  multiStoreSurcharge?: number
  payment: Payment
  status: OrderStatus
  placedAt: string
  customerName: string
  address: string
  riderName?: string
  riderPhone?: string
  customerPhone?: string
  pickupOtp?: string
  deliveryOtp?: string
  pickupVerified?: boolean
  paymentConfirmed?: boolean
  cashRemittedToSeller?: boolean
}

export const DEFAULT_DELIVERY_DISTANCE_KM = 4
export const FREE_DELIVERY_THRESHOLD = 199

export const CUSTOMER_DELIVERY_FEE = 40
export const SELLER_DELIVERY_FEE_BELOW_THRESHOLD = 0
export const SELLER_DELIVERY_FEE_AT_THRESHOLD = 0
export const MULTI_STORE_SURCHARGE = 0
export const PLATFORM_FEE_THRESHOLD = 100
export const DEFAULT_PLATFORM_FEE = 0
export const MAX_PLATFORM_FEE = 0
export const DELIVERY_DISCOUNT_PERCENT = 50
export const SELLER_COMMISSION_PERCENT = 5

export const DELIVERY_SLABS = [
  { label: '0–2 km', maxDistanceKm: 2, customerFee: CUSTOMER_DELIVERY_FEE, riderPayout: 20 },
  { label: '2–3 km', maxDistanceKm: 3, customerFee: CUSTOMER_DELIVERY_FEE, riderPayout: 23 },
  { label: '3–4 km', maxDistanceKm: 4, customerFee: CUSTOMER_DELIVERY_FEE, riderPayout: 26 },
  { label: '4–5 km', maxDistanceKm: 5, customerFee: CUSTOMER_DELIVERY_FEE, riderPayout: 29 },
  { label: '5–6 km', maxDistanceKm: 6, customerFee: CUSTOMER_DELIVERY_FEE, riderPayout: 32 },
] as const

export const PLATFORM_FEE_SLABS = [
  { label: 'Above ₹100', maxOrderValue: Number.POSITIVE_INFINITY, fee: DEFAULT_PLATFORM_FEE },
] as const

export function deliverySlabFor(distanceKm: number) {
  return DELIVERY_SLABS.find(slab => distanceKm <= slab.maxDistanceKm) ?? DELIVERY_SLABS[DELIVERY_SLABS.length - 1]
}

export function platformFeeFor(_itemTotal: number, _configuredFee = DEFAULT_PLATFORM_FEE) {
  return 0
}

function toPaise(amount: number) {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100)
}

export function billFor(itemTotal: number, distanceKm = DEFAULT_DELIVERY_DISTANCE_KM, shopSelfDelivers = false, options: { multiStore?: boolean; platformFee?: number } = {}) {
  const slab = deliverySlabFor(distanceKm)
  const itemTotalPaise = toPaise(itemTotal)
  const deliveryFeeBeforeDiscountPaise = itemTotalPaise <= 0 || shopSelfDelivers ? 0 : toPaise(slab.customerFee)
  const qualifiesForDeliveryDiscount = itemTotalPaise >= toPaise(FREE_DELIVERY_THRESHOLD)
  const deliveryDiscountPaise = qualifiesForDeliveryDiscount ? Math.round(deliveryFeeBeforeDiscountPaise * DELIVERY_DISCOUNT_PERCENT / 100) : 0
  const deliveryFeePaise = deliveryFeeBeforeDiscountPaise - deliveryDiscountPaise
  const platformFeePaise = 0
  const multiStoreSurchargePaise = 0
  const sellerDeliveryDeduction = 0
  // LazyHand charges the shop/restaurant 5% of the item subtotal on every order.
  // It is deducted from the seller payout, never added to the customer's total.
  const sellerCommissionPaise = itemTotalPaise <= 0 ? 0 : Math.round(itemTotalPaise * SELLER_COMMISSION_PERCENT / 100)
  return {
    itemTotal: itemTotalPaise / 100,
    deliveryFeeBeforeDiscount: deliveryFeeBeforeDiscountPaise / 100,
    deliveryDiscount: deliveryDiscountPaise / 100,
    deliveryFee: deliveryFeePaise / 100,
    platformFeeBeforeDiscount: 0,
    platformDiscount: 0,
    platformFee: platformFeePaise / 100,
    multiStoreSurcharge: multiStoreSurchargePaise / 100,
    deliveryDistanceKm: distanceKm,
    riderPayout: itemTotalPaise <= 0 || shopSelfDelivers ? 0 : slab.riderPayout,
    sellerDeliveryDeduction,
    sellerCommission: sellerCommissionPaise / 100,
    sellerPayout: Math.max(0, itemTotalPaise - sellerCommissionPaise - sellerDeliveryDeduction * 100) / 100,
    total: (itemTotalPaise + deliveryFeePaise + platformFeePaise + multiStoreSurchargePaise) / 100,
  }
}

export const seedHistory: Order[] = [
  {
    id: 'LH2402', shopId: 'gupta', payment: 'cod', status: 'delivered', placedAt: '12 Nov', customerName: 'You', address: '',
    lines: [
      { productId: 'p1', name: 'Maggi 2-Min Noodles', price: 14, qty: 2 },
      { productId: 'p2', name: 'Amul Toned Milk', price: 28, qty: 1 },
      { productId: 'p3', name: 'Britannia Bread', price: 45, qty: 1 },
    ],
    ...billFor(101),
  },
  {
    id: 'LH2377', shopId: 'raj', payment: 'cod', status: 'delivered', placedAt: '8 Nov', customerName: 'You', address: '',
    lines: [
      { productId: 'p9', name: 'Toor Dal', price: 165, qty: 1 },
      { productId: 'p10', name: 'Sugar', price: 48, qty: 2 },
    ],
    ...billFor(261),
  },
]

export const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`
