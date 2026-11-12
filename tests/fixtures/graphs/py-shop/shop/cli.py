from shop import OrderService
from shop.util import slug


def main():
    service = OrderService()
    total = service.place([100, 250], percent=10)
    print(f"{slug('Order Total')}: {total}")


if __name__ == "__main__":
    main()
