package plugin

import (
	"context"
	"strings"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestFetchCubeMetadataWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	pluginContext := backend.PluginContext{
		DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
			JSONData: []byte(`{}`),
		},
	}

	_, err := ds.fetchCubeMetadata(context.Background(), pluginContext)

	if err == nil {
		t.Fatalf("Expected error, got none")
	}

	if !strings.Contains(err.Error(), "Cube API URL is required") {
		t.Fatalf("Expected error about URL not configured, got: %s", err.Error())
	}
}
