// Helper functions for projectile trajectory calculation
package engine

import "fmt"

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// distance calculates the 3D Euclidean distance between two points
func distance(x1, y1, z1, x2, y2, z2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	dz := z2 - z1
	return dx*dx + dy*dy + dz*dz // Return squared distance for performance (no sqrt needed for comparison)
}

// parseFloat is a helper to parse string to float64
func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}
