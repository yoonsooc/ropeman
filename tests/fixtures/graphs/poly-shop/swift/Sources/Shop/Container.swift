protocol Payable {
    func total() -> Int
}

class Container {
    func count() -> Int { return 0 }
}

enum Tax {
    static func rate() -> Int { return 1 }
}
