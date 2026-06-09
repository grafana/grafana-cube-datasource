package models

import (
	"encoding/json"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestLoadPluginSettings(t *testing.T) {
	tests := []struct {
		name           string
		sourceURL      string
		expectedURL    string
		deploymentType string
	}{
		{
			name:           "uses top-level URL",
			sourceURL:      "http://standard-url:4000",
			expectedURL:    "http://standard-url:4000",
			deploymentType: "self-hosted-dev",
		},
		{
			name:           "empty URL results in empty URL",
			sourceURL:      "",
			expectedURL:    "",
			deploymentType: "self-hosted-dev",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData := `{"deploymentType": "` + tt.deploymentType + `"}`

			source := backend.DataSourceInstanceSettings{
				URL:      tt.sourceURL,
				JSONData: []byte(jsonData),
			}

			settings, err := LoadPluginSettings(source)
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if settings.URL != tt.expectedURL {
				t.Errorf("Expected URL %q, got %q", tt.expectedURL, settings.URL)
			}
		})
	}
}

func TestLoadPluginSettings_GrafanaCloud(t *testing.T) {
	jsonData, _ := json.Marshal(map[string]string{
		"deploymentType": "grafana-cloud",
		"authServiceURL": "https://auth.example.com",
	})
	src := backend.DataSourceInstanceSettings{
		JSONData: jsonData,
		DecryptedSecureJSONData: map[string]string{
			"capToken": "test-cap-token",
		},
	}

	s, err := LoadPluginSettings(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.DeploymentType != "grafana-cloud" {
		t.Errorf("expected grafana-cloud, got %s", s.DeploymentType)
	}
	if s.AuthServiceURL != "https://auth.example.com" {
		t.Errorf("expected auth URL, got %s", s.AuthServiceURL)
	}
	if s.Secrets.CAPToken != "test-cap-token" {
		t.Errorf("expected cap token, got %s", s.Secrets.CAPToken)
	}
}
