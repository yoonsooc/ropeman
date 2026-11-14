class Cart: Container, Payable {
    func total() -> Int {
        return count() + Tax.rate()
    }
}

struct Coupon: Payable {
    func total() -> Int { return 0 }
}

extension Cart: Sendable {}
