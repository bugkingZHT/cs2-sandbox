package demoinfocs

import (
	"bytes"
	"reflect"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func buttonMessage(field protowire.Number, value []byte) []byte {
	return protowire.AppendBytes(protowire.AppendTag(nil, field, protowire.BytesType), value)
}

func buttonPayload(buttons uint64) []byte {
	return buttonMessage(1, buttonMessage(3, protowire.AppendVarint([]byte{8}, buttons)))
}

func TestDecodeUserCmdButtons(t *testing.T) {
	for _, tt := range []struct {
		name  string
		data  []byte
		delta bool
		want  uint64
		bad   bool
	}{
		{"combined buttons", buttonPayload(uint64(common.ButtonAttack | common.ButtonJump | common.ButtonForward)), false, 11, false},
		{"64 bit mask", buttonPayload(1 << 40), false, 1 << 40, false},
		{"unchanged delta", []byte{0x0a, 2, 0x10, 5}, true, 11, false},
		{"explicit release", buttonPayload(0), true, 0, false},
		{"reset buttonstate1", []byte{0x0a, 3, 0x1a, 1, 0x0f}, true, 0, false},
		{"reset buttons message", []byte{0x0a, 1, 0x1f}, true, 0, false},
		{"reset base message", []byte{0x0f}, true, 0, false},
		{"unrelated reset", []byte{0x17}, true, 11, false},
		{"transition masks are not held buttons", []byte{0x0a, 6, 0x1a, 4, 0x10, 4, 0x18, 8}, true, 11, false},
		{"opaque repeated delta", []byte{0x12, 4, 0x17, 0x02, 1, 0x0f}, true, 11, false},
		{"truncated message", []byte{0x0a, 5, 0x1a}, true, 0, true},
		{"truncated mask", []byte{0x0a, 3, 0x1a, 1, 8}, true, 0, true},
		{"invalid tag", []byte{0}, true, 0, true},
		{"wrong wire type", []byte{8, 1}, true, 0, true},
		{"reset invalid in full protobuf", []byte{0x0f}, false, 0, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decodeUserCmdButtons(tt.data, []protowire.Number{1, 3, 1}, 11, tt.delta)
			if (err != nil) != tt.bad || (!tt.bad && got != tt.want) {
				t.Fatalf("buttons=%d err=%v; want %d, error=%v", got, err, tt.want, tt.bad)
			}
		})
	}
}

func testButtonCommand(t *testing.T, slot, number int32, full, delta []byte) *msg.CMsgServerUserCmd {
	t.Helper()
	cmd := &msg.CMsgServerUserCmd{PlayerSlot: proto.Int32(slot), CmdNumber: proto.Int32(number), Data: full}
	// Exercise the actual wire format of field 6 through the older generated type.
	data, err := proto.Marshal(cmd)
	if err != nil {
		t.Fatal(err)
	}
	if delta != nil {
		data = append(data, buttonMessage(6, delta)...)
	}
	if err := proto.Unmarshal(data, cmd); err != nil {
		t.Fatal(err)
	}
	return cmd
}

func TestUserCommandButtonState(t *testing.T) {
	p := NewParser(bytes.NewReader(make([]byte, 16))).(*parser)
	defer p.Close()
	player := &common.Player{EntityID: 3}
	p.gameState.playersByEntityID[3] = player
	var updates []uint64
	warnings := 0
	buttonHandler := p.RegisterEventHandler(func(e events.PlayerButtonsStateUpdate) {
		if e.Player != player {
			t.Fatal("buttons assigned to wrong player")
		}
		updates = append(updates, e.ButtonsState)
	})
	p.RegisterEventHandler(func(events.ParserWarn) { warnings++ })
	apply := func(cmd *msg.CMsgServerUserCmd) {
		// Verify registration as well as decoding.
		p.msgDispatcher.Dispatch(&msg.CSVCMsg_UserCommands{Commands: []*msg.CMsgServerUserCmd{cmd}})
	}
	apply(testButtonCommand(t, 2, 1, nil, buttonPayload(11))) // Missing baseline.
	if warnings != 1 || player.ButtonsPressedState != 0 {
		t.Fatal("accepted missing baseline")
	}
	checkpoint := testButtonCommand(t, 2, 1, buttonPayload(11), nil)
	p.msgDispatcher.Dispatch(userCmdButtonCheckpoint{&msg.CSVCMsg_UserCommands{Commands: []*msg.CMsgServerUserCmd{checkpoint}}})
	apply(testButtonCommand(t, 2, 2, nil, []byte{0x0a, 2, 0x10, 5})) // Held state.
	apply(testButtonCommand(t, 2, 3, nil, buttonPayload(4)))
	apply(testButtonCommand(t, 2, 2, nil, buttonPayload(8)))      // Out of order.
	apply(testButtonCommand(t, 2, 4, nil, []byte{0x0f, 0x0a, 9})) // Reset followed by corruption.
	if warnings != 3 || player.ButtonsPressedState != 4 {
		t.Fatal("invalid delta changed baseline")
	}
	p.msgDispatcher.Dispatch(userCmdButtonCheckpoint{&msg.CSVCMsg_UserCommands{Commands: []*msg.CMsgServerUserCmd{checkpoint}}})
	apply(testButtonCommand(t, 2, 5, nil, []byte{0x0a, 2, 0x10, 6}))
	if player.ButtonsPressedState != 4 {
		t.Fatal("checkpoint rolled back baseline")
	}
	apply(testButtonCommand(t, 2, 6, nil, []byte{0x0a, 3, 0x1a, 1, 0x0f}))
	apply(testButtonCommand(t, 2, 7, buttonPayload(8), buttonPayload(9))) // Full + delta.
	apply(testButtonCommand(t, 2, 8, []byte{0x0a, 0}, nil))               // Full snapshot without buttons clears them.
	if !reflect.DeepEqual(updates, []uint64{11, 4, 0, 9, 0}) {
		t.Fatalf("updates=%v", updates)
	}
	apply(testButtonCommand(t, 5, 1, buttonPayload(512), nil)) // Before player creation.
	other := &common.Player{EntityID: 6}
	p.gameState.playersByEntityID[6] = other
	p.UnregisterEventHandler(buttonHandler)
	apply(testButtonCommand(t, 5, 2, nil, []byte{0x0a, 2, 0x10, 5}))
	if other.ButtonsPressedState != 512 || player.ButtonsPressedState != 0 {
		t.Fatal("per-player baseline lost or mixed")
	}
	apply(nil)
	apply(testButtonCommand(t, -1, 1, buttonPayload(1), nil))
}
