package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestCallResource_JWKS(t *testing.T) {
	authSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/keys" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[]}`))
	}))
	defer authSrv.Close()

	d := &Datasource{
		authServiceURLOverride: authSrv.URL,
	}

	jsonData, _ := json.Marshal(map[string]string{
		"deploymentType": "grafana-cloud",
		"authServiceURL": authSrv.URL,
	})

	req := &backend.CallResourceRequest{
		Path: "jwks",
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                jsonData,
				DecryptedSecureJSONData: map[string]string{"capToken": "tok"},
			},
		},
	}

	resp := callHandler(t, d.CallResource, req)
	if resp == nil {
		t.Fatal("sender.Send was never called")
	}
	if resp.Status != 200 {
		t.Errorf("expected status 200, got %d (body: %s)", resp.Status, resp.Body)
	}
	if string(resp.Body) != `{"keys":[]}` {
		t.Errorf("unexpected body: %s", resp.Body)
	}
}

func TestCallResource_JWKS_NoAuthServiceURL(t *testing.T) {
	d := &Datasource{}

	jsonData, _ := json.Marshal(map[string]string{
		"deploymentType": "grafana-cloud",
	})

	req := &backend.CallResourceRequest{
		Path: "jwks",
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                jsonData,
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var resp *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(r *backend.CallResourceResponse) error {
		resp = r
		return nil
	})
	if err := d.CallResource(context.Background(), req, sender); err != nil {
		t.Fatalf("CallResource returned error: %v", err)
	}

	if resp == nil {
		t.Fatal("sender.Send was never called")
	}
	if resp.Status != 400 {
		t.Errorf("expected status 400 when no authServiceURL, got %d", resp.Status)
	}
}
