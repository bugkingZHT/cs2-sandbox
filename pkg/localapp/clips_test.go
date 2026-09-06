package localapp

import (
	"encoding/json"
	"testing"
)

func TestLocalClip(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, body := range []string{`{"meta":{"mapName":"de_ancient"},"frames":[]}`, `{"meta":{"mapName":"de_ancient"},"frames":[{"round":2,"timeMs":0}]}`, `{"meta":{"mapName":"de_ancient"},"frames":[{"round":1,"timeMs":1},{"round":1,"timeMs":0}]}`} {
		if w := call(s, "POST", "/api/clips", body); w.Code != 400 {
			t.Fatal("invalid clip accepted", w.Body.String())
		}
	}
	body := `{"meta":{"uuid":"../../outside","uploaderUid":"ignored","mapName":"de_ancient","fileName":"local_clip","totalRounds":25},"frames":[{"round":1,"timeMs":0,"players":{"1":{"inventory":["7"],"activeWeapon":"7"}}}]}`
	w := call(s, "POST", "/api/clips", body)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var st State
	if err := json.Unmarshal(w.Body.Bytes(), &st); err != nil {
		t.Fatal(err)
	}
	if st.ID == "../../outside" || st.Meta.UUID != st.ID || st.Meta.UploaderUID != "" || st.Meta.TotalRounds != 1 {
		t.Fatal("clip metadata was not localized")
	}
	if w := call(s, "GET", "/api/round?id="+st.ID+"&n=1", ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if len(s.library) != 1 {
		t.Fatal("clip is missing from local library")
	}
}
