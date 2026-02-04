package reflector

import (
	"reflect"
	"unsafe"

	demoinfocs "github.com/bugkingzht/cs-demobox/pkg/demoinfocs"
)

// getHeaderValue is a helper function to extract a field value from the unexported header
func getHeaderValue(p demoinfocs.Parser, fieldName string) reflect.Value {
	if p == nil {
		return reflect.Value{}
	}

	val := reflect.ValueOf(p)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}

	if val.Kind() != reflect.Struct {
		return reflect.Value{}
	}

	headerField := val.FieldByName("header")
	if !headerField.IsValid() || headerField.IsNil() {
		return reflect.Value{}
	}

	// Since header is an unexported pointer to an unexported struct,
	// we need to use unsafe to access its fields.
	headerPtr := unsafe.Pointer(headerField.Pointer())
	if headerPtr == nil {
		return reflect.Value{}
	}

	// Use reflection on the header struct itself even if it's unexported
	headerVal := reflect.NewAt(headerField.Type().Elem(), headerPtr).Elem()
	field := headerVal.FieldByName(fieldName)
	return field
}

// GetMapName extracts the map name from the unexported header field of the parser
func GetMapName(p demoinfocs.Parser) string {
	mapNameField := getHeaderValue(p, "MapName")
	if mapNameField.IsValid() {
		return mapNameField.String()
	}
	return "unknown"
}

// GetPlaybackFrames extracts the total number of frames from the unexported header field of the parser
func GetPlaybackFrames(p demoinfocs.Parser) int {
	framesField := getHeaderValue(p, "PlaybackFrames")
	if framesField.IsValid() {
		return int(framesField.Int())
	}
	return 0
}

// GetPlaybackTime extracts the total playback duration from the unexported header field of the parser
// Returns duration in milliseconds
func GetPlaybackTime(p demoinfocs.Parser) int64 {
	timeField := getHeaderValue(p, "PlaybackTime")
	if timeField.IsValid() {
		// PlaybackTime is of type time.Duration (int64 nanoseconds)
		duration := timeField.Int()
		// Convert nanoseconds to milliseconds
		return duration / 1_000_000
	}
	return 0
}
