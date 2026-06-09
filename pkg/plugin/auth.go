package plugin

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"

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

// stackID returns the Grafana stack ID for JWT namespace claims. Reads stackId
// from jsonData first so devenv provisioning can set the correct stack ID
// independently of OrgID (both devenv stacks run with OrgID=1).
func stackID(pCtx backend.PluginContext) int64 {
	if pCtx.DataSourceInstanceSettings != nil {
		var jd struct {
			StackID int64 `json:"stackId"`
		}
		if err := json.Unmarshal(pCtx.DataSourceInstanceSettings.JSONData, &jd); err == nil && jd.StackID != 0 {
			return jd.StackID
		}
	}
	return pCtx.OrgID
}
