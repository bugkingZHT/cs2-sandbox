package engine

type EngineConfig struct {
	ResolveFreezeTime bool
}

// Engine version
const (
	// EngineVersion is the version of the demo parsing engine
	EngineVersion = "v1.0.0"
)

// Default game timing parameters (CS2 standard competitive settings)
const (
	// DefaultFreezeTime is the default freeze time in seconds
	DefaultFreezeTime float64 = 15
	// DefaultRoundTime is the default round time in seconds (1:55)
	DefaultRoundTime float64 = 115
	// DefaultC4Timer is the default C4 explosion timer in seconds
	DefaultC4Timer float64 = 40
)

// GetFreezeTimeOrDefault returns the freeze time or default if zero
func GetFreezeTimeOrDefault(freezeTime float64) float64 {
	if freezeTime == 0 {
		return DefaultFreezeTime
	}
	return freezeTime
}

// GetRoundTimeOrDefault returns the round time or default if zero
func GetRoundTimeOrDefault(roundTime float64) float64 {
	if roundTime == 0 {
		return DefaultRoundTime
	}
	return roundTime
}

// GetC4TimerOrDefault returns the C4 timer or default if zero
func GetC4TimerOrDefault(c4Timer float64) float64 {
	if c4Timer == 0 {
		return DefaultC4Timer
	}
	return c4Timer
}
