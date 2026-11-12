from .models import Order
from .pricing import apply_discount
from .repo import OrderRepo


class OrderService:
    def __init__(self):
        self.repo = OrderRepo()

    def place(self, items, percent=0):
        order = Order(items)
        self.repo.save(order)
        return apply_discount(order.total(), percent)
