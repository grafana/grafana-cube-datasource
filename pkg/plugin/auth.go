package plugin

import (
	"encoding/json"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

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
