class ShopError(Exception):
    def describe(self):
        return self.__class__.__name__


class OutOfStock(ShopError):
    def __init__(self, sku):
        super().__init__(sku)
        self.sku = sku

    def label(self):
        return self.describe()
