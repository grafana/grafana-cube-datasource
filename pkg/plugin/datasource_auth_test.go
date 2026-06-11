package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/grafana/authlib/authn"
	"github.com/grafana/cube/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// mockExchanger implements authn.TokenExchanger for testing.
type mockExchanger struct {
	token string
	err   error
}

func (m *mockExchanger) Exchange(_ context.Context, _ authn.TokenExchangeRequest) (*authn.TokenExchangeResponse, error) {
	if m.err != nil {
		return nil, m.err
	}
	return &authn.TokenExchangeResponse{Token: m.token}, nil
}

func TestAddAuthHeadersWithContext_GrafanaCloud(t *testing.T) {
	d := &Datasource{
		exchanger: &mockExchanger{token: "test-jwt"},
	}

	req, _ := http.NewRequest("GET", "http://cube:4000", nil)
	config := &models.PluginSettings{
		DeploymentType: "grafana-cloud",
		GrafanaURL:     "http://grafana-1:3000",
		Secrets:        &models.SecretPluginSettings{CAPToken: "cap-token"},
	}
	pCtx := backend.PluginContext{
		OrgID: 1,
		User:  &backend.User{Login: "alice", Role: "Viewer"},
		DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
			UID:      "uid",
			Type:     "grafana-postgresql-datasource",
			JSONData: mustMarshalJSON(map[string]interface{}{"stackId": 1}),
		},
	}

	if err := d.addAuthHeadersWithContext(context.Background(), req, config, pCtx); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Header.Get("Authorization") != "Bearer test-jwt" {
		t.Errorf("expected Bearer test-jwt, got %s", req.Header.Get("Authorization"))
	}
	if got := req.Header.Get("X-Grafana-Datasource-Uid"); got != "uid" {
		t.Errorf("expected datasource uid header 'uid', got %q", got)
	}
	if got := req.Header.Get("X-Grafana-Datasource-Type"); got != "grafana-postgresql-datasource" {
		t.Errorf("expected datasource type header, got %q", got)
	}
	if got := req.Header.Get("X-Grafana-User-Id"); got != "alice" {
		t.Errorf("expected user id header 'alice', got %q", got)
	}
	if got := req.Header.Get("X-Grafana-Role"); got != "Viewer" {
		t.Errorf("expected role header 'Viewer', got %q", got)
	}
}

func TestValidateCredentials_GrafanaCloud(t *testing.T) {
	tests := []struct {
		name    string
		config  *models.PluginSettings
		wantErr bool
	}{
		{
			name: "valid grafana-cloud config",
			config: &models.PluginSettings{
				DeploymentType: "grafana-cloud",
				AuthServiceURL: "https://auth.example.com",
				GrafanaURL:     "https://grafana.example.com",
				Secrets:        &models.SecretPluginSettings{CAPToken: "tok"},
			},
			wantErr: false,
		},
		{
			name: "missing cap token",
			config: &models.PluginSettings{
				DeploymentType: "grafana-cloud",
				AuthServiceURL: "https://auth.example.com",
				GrafanaURL:     "https://grafana.example.com",
				Secrets:        &models.SecretPluginSettings{},
			},
			wantErr: true,
		},
		{
			name: "missing auth service url",
			config: &models.PluginSettings{
				DeploymentType: "grafana-cloud",
				GrafanaURL:     "https://grafana.example.com",
				Secrets:        &models.SecretPluginSettings{CAPToken: "tok"},
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCredentials(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateCredentials() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func mustMarshalJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
