package models

import (
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
			name:           "empty URL results in empty CubeApiUrl",
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

			if settings.CubeApiUrl != tt.expectedURL {
				t.Errorf("Expected CubeApiUrl %q, got %q", tt.expectedURL, settings.CubeApiUrl)
			}
		})
	}
}
