package model

func PriceOf(item Item) int {
	return round(item.Price)
}

func round(cents int) int {
	return cents
}
