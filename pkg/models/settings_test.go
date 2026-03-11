package models

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestLoadPluginSettings(t *testing.T) {
	tests := []struct {
		name           string
		sourceURL      string
		jsonDataURL    string
		expectedURL    string
		deploymentType string
	}{
		{
			name:           "prefers top-level URL over jsonData.cubeApiUrl",
			sourceURL:      "http://standard-url:4000",
			jsonDataURL:    "http://legacy-url:4000",
			expectedURL:    "http://standard-url:4000",
			deploymentType: "self-hosted-dev",
		},
		{
			name:           "falls back to jsonData.cubeApiUrl when top-level URL is empty",
			sourceURL:      "",
			jsonDataURL:    "http://legacy-url:4000",
			expectedURL:    "http://legacy-url:4000",
			deploymentType: "self-hosted-dev",
		},
		{
			name:           "uses top-level URL when jsonData.cubeApiUrl is not set",
			sourceURL:      "http://standard-url:4000",
			jsonDataURL:    "",
			expectedURL:    "http://standard-url:4000",
			deploymentType: "self-hosted-dev",
		},
		{
			name:           "both empty results in empty URL",
			sourceURL:      "",
			jsonDataURL:    "",
			expectedURL:    "",
			deploymentType: "self-hosted-dev",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData := `{"deploymentType": "` + tt.deploymentType + `"`
			if tt.jsonDataURL != "" {
				jsonData += `, "cubeApiUrl": "` + tt.jsonDataURL + `"`
			}
			jsonData += `}`

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
