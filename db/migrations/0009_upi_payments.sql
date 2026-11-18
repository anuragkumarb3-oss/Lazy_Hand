-- UPI (direct, no-gateway) collections.
-- Allow orders to record a 'upi' payment method alongside 'cod'. The
-- order_payments table already permits method 'upi'; this only widens the
-- orders.payment check so an order can be placed as a UPI order (payment
-- stays 'pending' in order_payments until an admin verifies it).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_check CHECK (payment IN ('cod', 'upi'));