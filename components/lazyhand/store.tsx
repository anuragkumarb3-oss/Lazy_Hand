'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  billFor,
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

type Cart = { shopId: string | null; items: Record<string, number> }

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
  setProfile: (profile: Profile) => void
  addItem: (productId: string) => void
  removeItem: (productId: string) => void
  resolveConflict: (replace: boolean) => void
  placeOrder: (payment: Payment, address: string) => Order | null
  reorder: (order: Order) => void
  setOrderStatus: (orderId: string, status: OrderStatus, riderName?: string) => void
  toggleShopOpen: (shopId: string) => void
  toggleStock: (productId: string) => void
  updatePrice: (productId: string, price: number) => void
}

const LazyHandContext = createContext<LazyHandState | null>(null)

export const emptyProfile: Profile = {
  name: '',
  phone: '',
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
  const [cart, setCart] = useState<Cart>({ shopId: null, items: {} })
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
        return { shopId: product.shopId, items: { ...current.items, [productId]: Math.min((current.items[productId] ?? 0) + 1, 20) } }
      })
    },
    [productById, shopById],
  )

  const removeItem = useCallback((productId: string) => {
    setCart(current => {
      const qty = (current.items[productId] ?? 0) - 1
      const items = { ...current.items }
      if (qty <= 0) delete items[productId]
      else items[productId] = qty
      return { shopId: Object.keys(items).length ? current.shopId : null, items }
    })
  }, [])

  const resolveConflict = useCallback(
    (replace: boolean) => {
      if (replace && conflictProductId) {
        const product = productById[conflictProductId]
        setCart({ shopId: product.shopId, items: { [conflictProductId]: 1 } })
      }
      setConflictProductId(null)
    },
    [conflictProductId, productById],
  )

  const placeOrder = useCallback(
    (payment: Payment, address: string) => {
      if (!cart.shopId || cartLines.length === 0) return null
      orderCounter += 1
      const order: Order = {
        id: `LH${orderCounter}`,
        shopId: cart.shopId,
        lines: cartLines.map(({ product, qty }) => ({ productId: product.id, name: product.name, price: product.price, qty })),
        ...billFor(cartTotal),
        payment,
        status: 'placed',
        placedAt: 'Today',
        customerName: profile.name || 'Guest',
        address,
      }
      setOrders(list => [order, ...list])
      setCart({ shopId: null, items: {} })
      return order
    },
    [cart.shopId, cartLines, cartTotal, profile.name],
  )

  const reorder = useCallback(
    (order: Order) => {
      const items: Record<string, number> = {}
      for (const line of order.lines) {
        const product = productById[line.productId]
        if (product?.inStock) items[line.productId] = line.qty
      }
      setCart({ shopId: Object.keys(items).length ? order.shopId : null, items })
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
    setProfile,
    addItem,
    removeItem,
    resolveConflict,
    placeOrder,
    reorder,
    setOrderStatus,
    toggleShopOpen,
    toggleStock,
    updatePrice,
  }

  return <LazyHandContext.Provider value={value}>{children}</LazyHandContext.Provider>
}

export function useLazyHand() {
  const ctx = useContext(LazyHandContext)
  if (!ctx) throw new Error('useLazyHand must be used inside LazyHandProvider')
  return ctx
}
