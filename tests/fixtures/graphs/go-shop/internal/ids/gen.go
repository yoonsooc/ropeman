package ids

import "strconv"

var next int

func Next() string {
	next++
	return strconv.Itoa(next)
}
