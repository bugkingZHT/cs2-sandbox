package engine

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg"
	"google.golang.org/protobuf/proto"
)

// Build a small real demo stream so metadata tests exercise message ordering and
// the parser's ServerInfo handler without committing a large recording.
func mapMetadataDemo(t *testing.T, headerMap, serverMap string, delay int) []byte {
	t.Helper()
	data := append([]byte("PBDEMS2\x00"), make([]byte, 8)...)
	command := func(kind msg.EDemoCommands, m proto.Message) {
		payload, err := proto.Marshal(m)
		if err != nil {
			t.Fatal(err)
		}
		data = binary.AppendUvarint(data, uint64(kind))
		data = binary.AppendUvarint(data, 0)
		data = binary.AppendUvarint(data, uint64(len(payload)))
		data = append(data, payload...)
	}
	command(msg.EDemoCommands_DEM_FileHeader, &msg.CDemoFileHeader{DemoFileStamp: proto.String("PBDEMS2"), MapName: proto.String(headerMap), NetworkProtocol: proto.Int32(14181)})
	for i := 0; i < delay; i++ {
		command(msg.EDemoCommands_DEM_SyncTick, &msg.CDemoSyncTick{})
	}
	payload, err := proto.Marshal(&msg.CSVCMsg_ServerInfo{MapName: proto.String(serverMap), MaxClasses: proto.Int32(1), TickInterval: proto.Float32(1.0 / 64)})
	if err != nil {
		t.Fatal(err)
	}
	var packet []byte
	bit := 0
	writeBits := func(value uint64, count int) {
		for i := 0; i < count; i++ {
			if bit/8 == len(packet) {
				packet = append(packet, 0)
			}
			packet[bit/8] |= byte((value>>i)&1) << (bit % 8)
			bit++
		}
	}
	// svc_ServerInfo (40) uses the 10-bit UBitInt representation.
	writeBits(8|16, 6)
	writeBits(2, 4)
	for _, b := range binary.AppendUvarint(nil, uint64(len(payload))) {
		writeBits(uint64(b), 8)
	}
	for _, b := range payload {
		writeBits(uint64(b), 8)
	}
	command(msg.EDemoCommands_DEM_SignonPacket, &msg.CDemoPacket{Data: packet})
	data = binary.AppendUvarint(data, uint64(msg.EDemoCommands_DEM_Stop))
	return binary.AppendUvarint(data, 0)
}

func TestMapMetadataSources(t *testing.T) {
	for _, tt := range []struct {
		name, header, server, initial, final string
		delay, frames                        int
	}{
		{"file header", "de_ancient", "de_nuke", "de_ancient", "de_ancient", 0, 1},
		{"missing header map", "", "de_nuke", "de_nuke", "de_nuke", 0, 2},
		{"delayed signon", "", "de_dust2", "de_dust2", "de_dust2", 3, 5},
		{"bounded lookahead and final backfill", "", "de_nuke", "", "de_nuke", 70, 65},
		{"missing everywhere", "", "", "", "", 0, 3},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := NewDemoEngine(EngineConfig{})
			defer e.Close()
			if err := e.InitParser(bytes.NewReader(mapMetadataDemo(t, tt.header, tt.server, tt.delay))); err != nil {
				t.Fatal(err)
			}
			meta, err := e.ExtractMetadata()
			if err != nil {
				t.Fatal(err)
			}
			if meta.MapName != tt.initial || e.parser.CurrentFrame() != tt.frames {
				t.Fatalf("initial map=%q frame=%d; want %q, %d", meta.MapName, e.parser.CurrentFrame(), tt.initial, tt.frames)
			}
			if _, err = e.ParseNextRound(nil); err != nil {
				t.Fatal(err)
			}
			meta, err = e.BackfillMeta(meta)
			if err != nil {
				t.Fatal(err)
			}
			if meta.MapName != tt.final || e.totalRawFrames != tt.delay+1 {
				t.Fatalf("final map=%q raw frames=%d; want %q, %d", meta.MapName, e.totalRawFrames, tt.final, tt.delay+1)
			}
		})
	}
}
