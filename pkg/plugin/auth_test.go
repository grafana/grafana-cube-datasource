package plugin

import (
	"encoding/json"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestStackID_ReadsFromJSONData(t *testing.T) {
	jsonData, _ := json.Marshal(map[string]interface{}{"stackId": 42})
	pCtx := backend.PluginContext{
		OrgID: 99,
		DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
			JSONData: jsonData,
		},
	}
	if got := stackID(pCtx); got != 42 {
		t.Errorf("expected 42 from jsonData, got %d", got)
	}
}

func TestStackID_FallsBackToOrgID(t *testing.T) {
	pCtx := backend.PluginContext{OrgID: 7}
	if got := stackID(pCtx); got != 7 {
		t.Errorf("expected OrgID 7 as fallback, got %d", got)
	}
}
