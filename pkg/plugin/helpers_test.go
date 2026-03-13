package plugin

import (
	"context"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func newTestPluginContext(url string) backend.PluginContext {
	return backend.PluginContext{
		DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
			URL:      url,
			JSONData: []byte(`{"deploymentType": "self-hosted-dev"}`),
		},
	}
}

func callHandler(t *testing.T, fn func(context.Context, *backend.CallResourceRequest, backend.CallResourceResponseSender) error, req *backend.CallResourceRequest) *backend.CallResourceResponse {
	return callHandlerWithContext(context.Background(), t, fn, req)
}

func callHandlerWithContext(ctx context.Context, t *testing.T, fn func(context.Context, *backend.CallResourceRequest, backend.CallResourceResponseSender) error, req *backend.CallResourceRequest) *backend.CallResourceResponse {
	t.Helper()
	var resp *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		resp = res
		return nil
	})
	if err := fn(ctx, req, sender); err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	return resp
}
