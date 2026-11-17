'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_DELIVERY_DISTANCE_KM,
  seedHistory,
  seedProducts,
  seedShops,
  type Order,
  type OrderStatus,
  type Payment,
  type Product,
  type Shop,
} from './data'
import type { Profile } from './onboarding'

type Cart = { shopId: string | null; items: Record<string, number>; deliveryDistanceKm: number }

type LazyHandState = {
  shops: Shop[]
  products: Product[]
  productById: Record<string, Product>
  shopById: Record<string, Shop>
  cart: Cart
  cartCount: number
  cartLines: { product: Product; qty: number }[]
  cartTotal: number
  conflictProductId: string | null
  orders: Order[]
  profile: Profile
  setOrders: (orders: Order[]) => void
  setProfile: (profile: Profile) => void
  setCatalogData: (shops: Shop[], products: Product[]) => void
  addItem: (productId: string) => void
  addCatalogItem: (product: Product, shop: Shop) => void
  removeItem: (productId: string) => void
  setDeliveryDistance: (distanceKm: number) => void
  resolveConflict: (replace: boolean) => void
  placeOrder: (payment: Payment, address: string) => Promise<Order | null>
  reorder: (order: Order) => void
  setOrderStatus: (orderId: string, status: OrderStatus, riderName?: string) => void
  verifyOrderOtp: (orderId: string, phase: 'pickup' | 'delivery', code: string) => boolean
  confirmOrderPayment: (orderId: string) => void
  remitOrderToSeller: (orderId: string) => void
  allowDemoOrders: boolean
  toggleShopOpen: (shopId: string) => void
  toggleStock: (productId: string) => void
  addProduct: (product: Omit<Product, 'id' | 'shopId'> & { shopId?: string }) => void
  updateProduct: (product: Product) => void
  updatePrice: (productId: string, price: number) => void
}

const LazyHandContext = createContext<LazyHandState | null>(null)

export const emptyProfile: Profile = {
  name: '',
  phone: '',
  whatsappNumber: '',
  whatsappAlertsEnabled: false,
  village: '',
  landmark: '',
  role: 'customer',
  shopName: '',
  shopType: '',
  vehicle: '',
}

function createOtp() {
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return String(values[0] % 10000).padStart(4, '0')
}

export function LazyHandProvider({ children, allowDemoOrders = false }: { children: ReactNode; allowDemoOrders?: boolean }) {
  const [shops, setShops] = useState(seedShops)
  const [products, setProducts] = useState(seedProducts)
  const [cart, setCart] = useState<Cart>({ shopId: null, items: {}, deliveryDistanceKm: DEFAULT_DELIVERY_DISTANCE_KM })
  const [conflictProductId, setConflictProductId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>(seedHistory)
  const [profile, setProfile] = useState<Profile>(emptyProfile)

  const setCatalogData = useCallback((nextShops: Shop[], nextProducts: Product[]) => {
    setShops(nextShops)
    setProducts(nextProducts)
  }, [])

  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const shopById = useMemo(() => Object.fromEntries(shops.map(s => [s.id, s])), [shops])

  const cartLines = useMemo(
    () => Object.entries(cart.items).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ product: productById[id], qty })).filter(l => l.product),
    [cart.items, productById],
  )
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0)
  const cartTotal = cartLines.reduce((sum, l) => sum + l.qty * l.product.price, 0)

  const addItem = useCallback(
    (productId: string) => {
      const product = productById[productId]
      if (!product || (product.demoOnly && !allowDemoOrders) || !product.inStock || !shopById[product.shopId]?.open) return
      const stockLimit = Math.min(20, Math.max(0, product.stock ?? 20))
      setCart(current => {
        const currentShopIds = new Set(Object.entries(current.items).filter(([, qty]) => qty > 0).map(([id]) => productById[id]?.shopId).filter(Boolean))
        if (currentShopIds.size > 0 && !currentShopIds.has(product.shopId)) {
          setConflictProductId(productId)
          return current
        }
        return { ...current, shopId: current.shopId ?? product.shopId, items: { ...current.items, [productId]: Math.min((current.items[productId] ?? 0) + 1, stockLimit) } }
      })
    },
    [allowDemoOrders, productById, shopById],
  )

  const addCatalogItem = useCallback((product: Product, shop: Shop) => {
    if ((product.demoOnly && !allowDemoOrders) || !product.inStock || !shop.open) return
    const stockLimit = Math.min(20, Math.max(0, product.stock ?? 20))
    setShops(current => current.some(item => item.id === shop.id) ? current : [...current, shop])
    setProducts(current => current.some(item => item.id === product.id) ? current : [...current, product])
    setCart(current => {
      const currentShopIds = new Set(Object.entries(current.items).filter(([, qty]) => qty > 0).map(([id]) => productById[id]?.shopId).filter(Boolean))
      if (currentShopIds.size > 0 && !currentShopIds.has(product.shopId)) {
        setConflictProductId(product.id)
        return current
      }
      return { ...current, shopId: current.shopId ?? product.shopId, items: { ...current.items, [product.id]: Math.min((current.items[product.id] ?? 0) + 1, stockLimit) } }
    })
  }, [allowDemoOrders, productById])

  const removeItem = useCallback((productId: string) => {
    setCart(current => {
      const items = { ...current.items }
      delete items[productId]
      return { ...current, shopId: Object.keys(items).length ? current.shopId : null, items }
    })
  }, [])

  const setDeliveryDistance = useCallback((distanceKm: number) => {
    setCart(current => ({ ...current, deliveryDistanceKm: distanceKm }))
  }, [])

  const resolveConflict = useCallback(
    (replace: boolean) => {
      if (replace && conflictProductId) {
        const product = productById[conflictProductId]
        setCart(current => ({ ...current, shopId: current.shopId ?? product.shopId, items: { ...current.items, [conflictProductId]: Math.min((current.items[conflictProductId] ?? 0) + 1, 20) } }))
      }
      setConflictProductId(null)
    },
    [conflictProductId, productById],
  )

  const placeOrder = useCallback(
    async (_payment: Payment, _address: string) => {
      if (!cart.shopId || cartLines.length === 0) return null
      throw new Error('Delivery route distance cannot be confirmed yet. Checkout is temporarily unavailable.')
    },
    [cart.shopId, cartLines.length],
  )

  const reorder = useCallback(
    (order: Order) => {
      const items: Record<string, number> = {}
      for (const line of order.lines) {
        const product = productById[line.productId]
        if (product?.inStock) items[line.productId] = line.qty
      }
      setCart({ shopId: Object.keys(items).length ? order.shopId : null, items, deliveryDistanceKm: order.deliveryDistanceKm })
    },
    [productById],
  )

  const setOrderStatus = useCallback((orderId: string, status: OrderStatus, riderName?: string) => {
    setOrders(list => {
      const selected = list.find(order => order.id === orderId)
      if (!selected) return list
      const currentRider = riderName ?? selected.riderName ?? (profile.role === 'rider' && profile.name ? profile.name : 'Sunil (you)')
      const riderBusy = list.some(order => order.id !== orderId && order.riderName === currentRider && ['ready', 'picked'].includes(order.status))
      if (status === 'ready' && riderBusy && !selected.riderName) return list
      return list.map(order => order.id === orderId ? {
        ...order,
        status,
        riderName: status === 'ready' ? (riderBusy ? undefined : currentRider) : (riderName ?? order.riderName),
        pickupOtp: status === 'ready' ? createOtp() : order.pickupOtp,
      } : order)
    })
  }, [profile.name, profile.role])

  const verifyOrderOtp = useCallback((orderId: string, phase: 'pickup' | 'delivery', code: string) => {
    const currentOrder = orders.find(order => order.id === orderId)
    const expected = phase === 'pickup' ? currentOrder?.pickupOtp : currentOrder?.deliveryOtp
    if (!currentOrder || !expected || code.trim() !== expected || (phase === 'delivery' && !currentOrder.paymentConfirmed)) return false
    setOrders(list => list.map(order => order.id !== orderId ? order : phase === 'pickup'
      ? { ...order, pickupVerified: true, status: 'picked' }
      : { ...order, status: 'delivered' }))
    return true
  }, [orders])

  const confirmOrderPayment = useCallback((orderId: string) => {
    setOrders(list => list.map(order => order.id === orderId && order.status === 'picked' ? { ...order, paymentConfirmed: true } : order))
  }, [])

  const remitOrderToSeller = useCallback((orderId: string) => {
    setOrders(list => list.map(order => order.id === orderId && order.status === 'delivered' && order.paymentConfirmed ? { ...order, cashRemittedToSeller: true } : order))
  }, [])

  const toggleShopOpen = useCallback((shopId: string) => {
    setShops(list => list.map(s => (s.id === shopId ? { ...s, open: !s.open } : s)))
  }, [])

  const toggleStock = useCallback((productId: string) => {
    setProducts(list => list.map(p => (p.id === productId ? { ...p, inStock: !p.inStock } : p)))
  }, [])

  const addProduct = useCallback((product: Omit<Product, 'id' | 'shopId'> & { shopId?: string }) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setProducts(list => [{ ...product, id, shopId: product.shopId ?? 'gupta' }, ...list])
  }, [])

  const updateProduct = useCallback((product: Product) => {
    setProducts(list => list.map(item => (item.id === product.id ? product : item)))
  }, [])

  const updatePrice = useCallback((productId: string, price: number) => {
    setProducts(list => list.map(p => (p.id === productId ? { ...p, price } : p)))
  }, [])

  const value: LazyHandState = {
    shops,
    products,
    productById,
    shopById,
    cart,
    cartCount,
    cartLines,
    cartTotal,
    conflictProductId,
    orders,
    profile,
    setOrders,
    setProfile,
    setCatalogData,
    addItem,
    addCatalogItem,
    removeItem,
    setDeliveryDistance,
    resolveConflict,
    placeOrder,
    reorder,
    setOrderStatus,
    verifyOrderOtp,
    confirmOrderPayment,
    remitOrderToSeller,
    allowDemoOrders,
    toggleShopOpen,
    toggleStock,
    addProduct,
    updateProduct,
    updatePrice,
  }

  return <LazyHandContext.Provider value={value}>{children}</LazyHandContext.Provider>
}

export function useLazyHand() {
  const ctx = useContext(LazyHandContext)
  if (!ctx) throw new Error('useLazyHand must be used inside LazyHandProvider')
  return ctx
}
