package sendtablescs2

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"testing"
)

// Source 2 fields need not start on a byte boundary. Keep a trailing marker
// to catch under-reading that would corrupt the next entity's opcode.
func offsetReader(data []byte, offset uint32) *reader {
	packed := make([]byte, len(data)+1)
	for i, b := range data {
		packed[i] |= b << offset
		if offset > 0 {
			packed[i+1] |= b >> (8 - offset)
		}
	}
	r := newReader(packed)
	r.readBits(offset)
	return r
}

func TestCGlobalSymbolDecoder(t *testing.T) {
	for _, value := range []string{"", "active_weapon", "secondary_skeleton"} {
		for offset := uint32(0); offset < 8; offset++ {
			t.Run(fmt.Sprintf("%s/offset%d", value, offset), func(t *testing.T) {
				r := offsetReader(append([]byte(value), 0, 0x5a), offset)
				decoder := fieldTypeDecoders["CGlobalSymbol"]
				if decoder == nil {
					t.Fatal("CGlobalSymbol must not fall back to varuint32")
				}
				if got := decoder(r); got != value {
					t.Fatalf("decoded %q, want %q", got, value)
				}
				if r.readByte() != 0x5a {
					t.Fatal("next field is misaligned")
				}
			})
		}
	}
}

func TestCUtlBinaryBlockDecoder(t *testing.T) {
	for _, payload := range [][]byte{{}, {0, 0xff, 0x80, 1}, bytes.Repeat([]byte{0xa5}, 300)} {
		for offset := uint32(0); offset < 8; offset++ {
			t.Run(fmt.Sprintf("length%d/offset%d", len(payload), offset), func(t *testing.T) {
				wire := binary.AppendUvarint(nil, uint64(len(payload)))
				wire = append(wire, payload...)
				r := offsetReader(append(wire, 0x5a), offset)
				decoder := fieldTypeDecoders["CUtlBinaryBlock"]
				if decoder == nil {
					t.Fatal("CUtlBinaryBlock must consume its length-prefixed payload")
				}
				got, ok := decoder(r).([]byte)
				if !ok || !bytes.Equal(got, payload) {
					t.Fatalf("incorrect binary payload: %v", got)
				}
				if r.readByte() != 0x5a {
					t.Fatal("next field is misaligned")
				}
			})
		}
	}
}
