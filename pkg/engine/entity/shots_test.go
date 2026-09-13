package entity

import (
	"encoding/json"
	"testing"

	"google.golang.org/protobuf/proto"
)

func TestShotDataRoundTrip(t *testing.T) {
	for _, count := range []int{0, 1, 3} {
		frame := PlayerFrame{ShotsFired: count, ShotYaw: 123}
		data, err := proto.Marshal(PlayerFrameToProtoPB(&frame))
		if err != nil {
			t.Fatal(err)
		}
		var decoded PlayerFramePB
		if err := proto.Unmarshal(data, &decoded); err != nil {
			t.Fatal(err)
		}
		if int(decoded.GetShotsFired()) != count || decoded.ShotYaw != 123 {
			t.Fatalf("shot data lost in protobuf: %+v", &decoded)
		}
		data, err = json.Marshal(frame)
		if err != nil {
			t.Fatal(err)
		}
		var jsonFrame map[string]any
		if err := json.Unmarshal(data, &jsonFrame); err != nil {
			t.Fatal(err)
		}
		if jsonFrame["shotsFired"] != float64(count) {
			t.Fatal("JSON shot count lost")
		}
	}
}
