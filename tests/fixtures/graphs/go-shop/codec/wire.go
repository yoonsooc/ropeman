package codec

import "encoding/json"

func Encode(v any) ([]byte, error) {
	return json.Marshal(v)
}
