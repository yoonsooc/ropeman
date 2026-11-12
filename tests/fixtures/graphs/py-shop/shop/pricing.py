ROUND = 2


def sum_prices(prices):
    total = 0
    for price in prices:
        total += price
    return total


def apply_discount(amount, percent):
    return amount - amount * percent / 100
