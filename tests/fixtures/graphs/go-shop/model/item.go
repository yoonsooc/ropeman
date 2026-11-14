package model

import "time"

func (i Item) Expired(now time.Time) bool {
	return now.IsZero()
}
