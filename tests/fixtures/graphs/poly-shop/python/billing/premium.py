from .errors import ShopError
from . import models


class PremiumOrder(models.Order):
    def doubled(self):
        return super().total() * 2


class PaymentError(ShopError):
    pass


def check(order):
    if order is None:
        raise PaymentError()
