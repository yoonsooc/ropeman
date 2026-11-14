package shop

abstract class Entity {
  def base(): Int = 1
}

trait Priced

object Fees {
  def flat(): Int = 2
}
