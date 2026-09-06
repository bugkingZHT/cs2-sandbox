package demoinfocs

import (
	"fmt"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg"
	"google.golang.org/protobuf/encoding/protowire"
)

// Only the latest command is used as the baseline for the next button delta.
// Keep it per controller slot, including commands received before player creation.
type userCmdButtons struct {
	commandNumber int32
	buttons       uint64
}

type userCmdButtonCheckpoint struct{ commands *msg.CSVCMsg_UserCommands }

func (p *parser) handleUserCommandButtonCheckpoint(checkpoint userCmdButtonCheckpoint) {
	// The initial checkpoint may contain the only full baseline for a player.
	// Later checkpoints duplicate the stream; never roll an existing state back.
	for _, cmd := range checkpoint.commands.Commands {
		if cmd == nil || len(cmd.Data) == 0 {
			continue
		}
		if _, exists := p.userCmdButtonStates[cmd.GetPlayerSlot()]; !exists {
			p.handleUserCommandButtons(&msg.CSVCMsg_UserCommands{Commands: []*msg.CMsgServerUserCmd{cmd}})
		}
	}
}

// CMsgServerUserCmd.delta_data is field 6 in netmessages.proto. Our vendored
// generated message predates it, so protobuf retains it in the unknown fields.
// Read it without regenerating unrelated network message definitions.
func userCmdDeltaData(cmd *msg.CMsgServerUserCmd) ([]byte, error) {
	var delta []byte
	for data := cmd.ProtoReflect().GetUnknown(); len(data) > 0; {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		data = data[n:]
		n = protowire.ConsumeFieldValue(num, typ, data)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		if num == 6 {
			if typ != protowire.BytesType {
				return nil, fmt.Errorf("user command delta_data has wire type %d", typ)
			}
			delta, _ = protowire.ConsumeBytes(data)
		}
		data = data[n:]
	}
	return delta, nil
}

// Follow CSGOUserCmdPB.base.buttons_pb.buttonstate1 (fields 1, 3, 1).
// See csgo/{cs_usercmd,usercmd}.proto in SteamDatabase/Protobufs.
// Delta data omits unchanged fields and uses wire type 7 to reset a field.
// Other fields, including the custom repeated subtick/history encoding, can be
// skipped as opaque payloads: they do not change the held-button bitmask.
func decodeUserCmdButtons(data []byte, path []protowire.Number, buttons uint64, delta bool) (uint64, error) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return 0, protowire.ParseError(n)
		}
		data = data[n:]
		if delta && typ == 7 {
			if num == path[0] {
				buttons = 0
			}
			continue
		}
		n = protowire.ConsumeFieldValue(num, typ, data)
		if n < 0 {
			return 0, protowire.ParseError(n)
		}
		if num == path[0] {
			if len(path) == 1 {
				if typ != protowire.VarintType {
					return 0, fmt.Errorf("buttonstate1 has wire type %d", typ)
				}
				buttons, _ = protowire.ConsumeVarint(data)
			} else {
				if typ != protowire.BytesType {
					return 0, fmt.Errorf("user command button message has wire type %d", typ)
				}
				value, _ := protowire.ConsumeBytes(data)
				var err error
				buttons, err = decodeUserCmdButtons(value, path[1:], buttons, delta)
				if err != nil {
					return 0, err
				}
			}
		}
		data = data[n:]
	}
	return buttons, nil
}

func (p *parser) handleUserCommandButtons(m *msg.CSVCMsg_UserCommands) {
	path := []protowire.Number{1, 3, 1}
	for _, cmd := range m.Commands {
		if cmd == nil || cmd.CmdNumber == nil || cmd.GetPlayerSlot() < 0 {
			continue
		}
		slot, number := cmd.GetPlayerSlot(), cmd.GetCmdNumber()
		previous, exists := p.userCmdButtonStates[slot]
		warn := func(err error) {
			p.eventDispatcher.Dispatch(events.ParserWarn{
				Message: fmt.Sprintf("user command buttons (slot %d, command %d): %v", slot, number, err),
			})
		}
		delta, err := userCmdDeltaData(cmd)
		if err != nil {
			warn(err)
			continue
		}
		if len(cmd.Data) == 0 && len(delta) == 0 {
			continue
		}
		var buttons uint64
		if len(cmd.Data) > 0 {
			buttons, err = decodeUserCmdButtons(cmd.Data, path, 0, false)
		} else if !exists || number < previous.commandNumber {
			warn(fmt.Errorf("missing or out-of-order delta baseline"))
			continue
		} else {
			buttons = previous.buttons
		}
		if err == nil && len(delta) > 0 {
			buttons, err = decodeUserCmdButtons(delta, path, buttons, true)
		}
		if err != nil {
			warn(err)
			continue
		}
		p.userCmdButtonStates[slot] = userCmdButtons{commandNumber: number, buttons: buttons}
		// Controller entity IDs are one-based; user command slots are zero-based.
		player := p.gameState.playersByEntityID[int(slot)+1]
		if player != nil && player.ButtonsPressedState != buttons {
			player.ButtonsPressedState = buttons
			p.eventDispatcher.Dispatch(events.PlayerButtonsStateUpdate{Player: player, ButtonsState: buttons})
		}
	}
}
