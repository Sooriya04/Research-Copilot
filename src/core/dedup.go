package core

import (
	"sync"
)

var (
	inFlightKeys  = make(map[string]bool)
	inFlightMutex sync.Mutex
)

// AcquireInFlight attempts to register an ingestion key (e.g., "arxiv:1706.03762").
// Returns true if acquired (key was not in-flight), false if already in-flight.
func AcquireInFlight(key string) bool {
	inFlightMutex.Lock()
	defer inFlightMutex.Unlock()

	if inFlightKeys[key] {
		return false
	}
	inFlightKeys[key] = true
	return true
}

// ReleaseInFlight releases the key from in-flight tracking once ingestion finishes.
func ReleaseInFlight(key string) {
	inFlightMutex.Lock()
	defer inFlightMutex.Unlock()

	delete(inFlightKeys, key)
}
