package reflector

import (
	"reflect"
	"unsafe"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
)

// GetMapName extracts the map name from the unexported header field of the parser
func GetMapName(p demoinfocs.Parser) string {
	if p == nil {
		return "unknown"
	}

	val := reflect.ValueOf(p)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}

	if val.Kind() != reflect.Struct {
		return "unknown"
	}

	headerField := val.FieldByName("header")
	if !headerField.IsValid() || headerField.IsNil() {
		return "unknown"
	}

	// Since header is an unexported pointer to an unexported struct,
	// we need to use unsafe to access its fields.
	// First, get the pointer to the header struct.
	headerPtr := unsafe.Pointer(headerField.Pointer())
	if headerPtr == nil {
		return "unknown"
	}

	// We need to know the offset of MapName in the header struct.
	// type header struct {
	// 	Filestamp       string        // 0
	// 	NetworkProtocol int           // 16 (on 64-bit)
	// 	ServerName      string        // 24
	// 	ClientName      string        // 40
	// 	MapName         string        // 56
	// 	GameDirectory   string        // 72
	// 	PlaybackTime    time.Duration // 88
	// 	PlaybackTicks   int           // 96
	// 	PlaybackFrames  int           // 104
	// }
	// However, using hardcoded offsets is brittle.
	// A better way with reflection if we can't cast:

	// We can use reflection on the header struct itself even if it's unexported,
	// but we need to use unsafe to make the fields addressable/readable if they are unexported.
	headerVal := reflect.NewAt(headerField.Type().Elem(), headerPtr).Elem()
	mapNameField := headerVal.FieldByName("MapName")
	if mapNameField.IsValid() {
		return mapNameField.String()
	}

	return "unknown"
}
