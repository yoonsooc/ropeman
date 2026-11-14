package shop

open class Container {
    fun size(): Int = 0
}

interface Shippable

class Basket : Container(), Shippable {
    fun weight(): Int = size() + Scale.unit()
}
