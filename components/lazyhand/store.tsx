'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  billFor,
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
  addItem: (productId: string) => void
  removeItem: (productId: string) => void
  setDeliveryDistance: (distanceKm: number) => void
  resolveConflict: (replace: boolean) => void
  placeOrder: (payment: Payment, address: string) => Promise<Order | null>
  reorder: (order: Order) => void
  setOrderStatus: (orderId: string, status: OrderStatus, riderName?: string) => void
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

let orderCounter = 2410

export function LazyHandProvider({ children }: { children: ReactNode }) {
  const [shops, setShops] = useState(seedShops)
  const [products, setProducts] = useState(seedProducts)
  const [cart, setCart] = useState<Cart>({ shopId: null, items: {}, deliveryDistanceKm: DEFAULT_DELIVERY_DISTANCE_KM })
  const [conflictProductId, setConflictProductId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>(seedHistory)
  const [profile, setProfile] = useState<Profile>(emptyProfile)

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
      if (!product || !product.inStock || !shopById[product.shopId]?.open) return
      setCart(current => {
        const hasItems = Object.values(current.items).some(q => q > 0)
        if (hasItems && current.shopId !== product.shopId) {
          setConflictProductId(productId)
          return current
        }
        return { ...current, shopId: product.shopId, items: { ...current.items, [productId]: Math.min((current.items[productId] ?? 0) + 1, 20) } }
      })
    },
    [productById, shopById],
  )

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
        setCart({ shopId: product.shopId, items: { [conflictProductId]: 1 }, deliveryDistanceKm: DEFAULT_DELIVERY_DISTANCE_KM })
      }
      setConflictProductId(null)
    },
    [conflictProductId, productById],
  )

  const placeOrder = useCallback(
    async (payment: Payment, address: string) => {
      if (!cart.shopId || cartLines.length === 0) return null
      const { data: { user }, error: authError } = await createClient().auth.getUser()
      if (authError) throw new Error('We could not verify your session. Please sign in again.')
      let order: Order

      if (user) {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: cart.shopId,
            lines: cartLines.map(({ product, qty }) => ({ productId: product.id, qty })),
            deliveryDistanceKm: cart.deliveryDistanceKm,
            address,
          }),
        })
        const result = await response.json().catch(() => null) as { order?: Order; error?: string } | null
        if (!response.ok || !result?.order) throw new Error(result?.error ?? 'Your order could not be saved. Please try again.')
        order = result.order
      } else {
        orderCounter += 1
        order = {
          id: `LH${orderCounter}`,
          shopId: cart.shopId,
          lines: cartLines.map(({ product, qty }) => ({ productId: product.id, name: product.name, price: product.price, qty })),
          ...billFor(cartTotal, cart.deliveryDistanceKm),
          payment,
          status: 'placed',
          placedAt: 'Today',
          customerName: profile.name || 'Guest',
          address,
        }
      }

      setOrders(list => [order, ...list])
      setCart({ shopId: null, items: {}, deliveryDistanceKm: DEFAULT_DELIVERY_DISTANCE_KM })
      return order
    },
    [cart.shopId, cart.deliveryDistanceKm, cartLines, cartTotal, profile.name],
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
    setOrders(list => list.map(o => (o.id === orderId ? { ...o, status, riderName: riderName ?? o.riderName } : o)))
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
    addItem,
    removeItem,
    setDeliveryDistance,
    resolveConflict,
    placeOrder,
    reorder,
    setOrderStatus,
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
