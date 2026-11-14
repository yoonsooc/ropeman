package shop

class Order extends Entity with Priced {
  def total(): Int = base() + Fees.flat()
}
