package lint

import (
	"example.com/shop/model"
	"example.com/shop/tools/rules"
)

func Run() error {
	return rules.Check(model.Item{})
}
