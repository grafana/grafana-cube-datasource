package plugin

import (
	"crypto/rand"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/grafana/authlib/types"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// nonceEntry holds the user context for a single-use introspect nonce.
type nonceEntry struct {
	StackID        int64
	DatasourceUID  string
	DatasourceType string
	UserID         string
	Role           string
	ExpiresAt      time.Time
}

// generateNonce returns a random 16-byte hex nonce for the introspect callback.
func generateNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

// stackID returns the Grafana stack ID, must be set by the server.
// falls back to the namespace's stack/org ID when the env is unset
// (e.g. unit tests / single-stack dev).
func stackID(pCtx backend.PluginContext) int64 {
	if v := os.Getenv("GF_ENVIRONMENT_STACK_ID"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil && id != 0 {
			return id
		}
	}
	if info, err := types.ParseNamespace(pCtx.Namespace); err == nil {
		if info.StackID != 0 {
			return info.StackID
		}
		if info.OrgID > 0 {
			return info.OrgID
		}
	}
	return 0
}
