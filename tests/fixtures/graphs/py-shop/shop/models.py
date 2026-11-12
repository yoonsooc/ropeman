from .pricing import sum_prices
from .util import new_id


class Order:
    def __init__(self, items):
        self.id = new_id("order")
        self.items = items

    def total(self):
        return sum_prices(self.items)
