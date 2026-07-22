package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/grafana/cube/pkg/models"
)

// intPtr returns a pointer to i, for setting Datasource.maxNetworkRetries.
func intPtr(i int) *int { return &i }

// devConfig is a minimal self-hosted-dev config (no auth) for load requests.
func devConfig() *models.PluginSettings {
	return &models.PluginSettings{DeploymentType: "self-hosted-dev"}
}

func successBody(t *testing.T) []byte {
	t.Helper()
	b, err := json.Marshal(CubeAPIResponse{
		Data: []map[string]interface{}{{"orders.count": "1"}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

// TestDoCubeLoadRequestRetriesOn502 verifies the bounded transient retry:
// Cube returns HTTP 502 twice, then 200. This mirrors the SDK, which retries
// status === 502 under networkErrorRetries. See docs/sdk-parity.md.
func TestDoCubeLoadRequestRetriesOn502(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount <= 2 {
			http.Error(w, "bad gateway", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(successBody(t))
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, networkRetryBackoffBase: time.Millisecond}

	body, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{"measures":["orders.count"]}`), devConfig())
	if err != nil {
		t.Fatalf("expected success after 502 retries, got: %v", err)
	}
	if requestCount != 3 {
		t.Fatalf("expected 3 requests (2x502 + success), got %d", requestCount)
	}
	if len(body) == 0 {
		t.Fatal("expected non-empty body")
	}
}

// TestDoCubeLoadRequestExhaustsRetriesReturns502 verifies that after the retry
// budget is exhausted, the upstream 502 status + body are preserved (parity
// with the SDK's RequestError, not collapsed to a generic error).
func TestDoCubeLoadRequestExhaustsRetriesReturns502(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		http.Error(w, "bad gateway body", http.StatusBadGateway)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, maxNetworkRetries: intPtr(2), networkRetryBackoffBase: time.Millisecond}

	_, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	var cubeErr *CubeAPIError
	if !errors.As(err, &cubeErr) {
		t.Fatalf("expected *CubeAPIError, got %T: %v", err, err)
	}
	if cubeErr.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected status 502, got %d", cubeErr.StatusCode)
	}
	// 1 initial attempt + 2 retries = 3 requests.
	if requestCount != 3 {
		t.Fatalf("expected 3 requests (1 + 2 retries), got %d", requestCount)
	}
}

// TestDoCubeLoadRequestDoesNotRetryNonRetryableStatus verifies that a non-502
// error status (e.g. 400) is surfaced immediately without retrying and with the
// upstream status/body preserved.
func TestDoCubeLoadRequestDoesNotRetryNonRetryableStatus(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		http.Error(w, `{"error":"bad query"}`, http.StatusBadRequest)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, networkRetryBackoffBase: time.Millisecond}

	_, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected error")
	}
	var cubeErr *CubeAPIError
	if !errors.As(err, &cubeErr) {
		t.Fatalf("expected *CubeAPIError, got %T: %v", err, err)
	}
	if cubeErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", cubeErr.StatusCode)
	}
	if requestCount != 1 {
		t.Fatalf("expected exactly 1 request (no retry on 400), got %d", requestCount)
	}
}

// TestDoCubeLoadRequestRetriesOnNetworkError verifies that a transient transport
// failure (connection dropped without a response) is retried, mirroring the
// SDK's "network error" retry category. The first request's connection is
// hijacked and closed to force a transport error; subsequent requests succeed.
func TestDoCubeLoadRequestRetriesOnNetworkError(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount == 1 {
			// Drop the connection abruptly so client.Do returns a network error.
			hj, ok := w.(http.Hijacker)
			if !ok {
				t.Error("ResponseWriter does not support hijacking")
				return
			}
			conn, _, err := hj.Hijack()
			if err != nil {
				t.Errorf("hijack failed: %v", err)
				return
			}
			_ = conn.Close()
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(successBody(t))
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, networkRetryBackoffBase: time.Millisecond}

	body, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err != nil {
		t.Fatalf("expected success after network-error retry, got: %v", err)
	}
	if requestCount < 2 {
		t.Fatalf("expected at least 2 requests (1 network failure + success), got %d", requestCount)
	}
	if len(body) == 0 {
		t.Fatal("expected non-empty body")
	}
}

// TestDoCubeLoadRequestNetworkErrorRetriesDisabled verifies that when retries
// are disabled (maxNetworkRetries=0), a transport failure is surfaced
// immediately rather than retried. This documents the SDK-default behavior
// (networkErrorRetries: 0) is available via configuration.
func TestDoCubeLoadRequestNetworkErrorRetriesDisabled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, _ := w.(http.Hijacker)
		conn, _, _ := hj.Hijack()
		_ = conn.Close()
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, maxNetworkRetries: intPtr(0)}

	_, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected error when retries disabled")
	}
	var cubeErr *CubeAPIError
	if errors.As(err, &cubeErr) {
		t.Fatalf("network failure should not be a CubeAPIError, got %v", err)
	}
}

// TestClassifyTransportError verifies the timeout/aborted/network classification
// that mirrors the SDK's HttpTransport categories.
func TestClassifyTransportError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want transportErrorKind
	}{
		{"deadline", context.DeadlineExceeded, transportTimeout},
		{"cancelled", context.Canceled, transportAborted},
		{"wrapped deadline", errors.New("x: " + context.DeadlineExceeded.Error()), transportNetworkError},
		{"network op", &net.OpError{Op: "dial", Err: errors.New("refused")}, transportNetworkError},
		{"generic", errors.New("boom"), transportNetworkError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyTransportError(tc.err); got != tc.want {
				t.Fatalf("classifyTransportError(%v) = %d, want %d", tc.err, got, tc.want)
			}
		})
	}
}

// TestRetryBackoffGrowsAndCaps verifies exponential growth capped at the max.
func TestRetryBackoffGrowsAndCaps(t *testing.T) {
	ds := &Datasource{networkRetryBackoffBase: 100 * time.Millisecond}
	if got := ds.retryBackoff(0); got != 100*time.Millisecond {
		t.Fatalf("attempt 0: got %v", got)
	}
	if got := ds.retryBackoff(1); got != 200*time.Millisecond {
		t.Fatalf("attempt 1: got %v", got)
	}
	if got := ds.retryBackoff(2); got != 400*time.Millisecond {
		t.Fatalf("attempt 2: got %v", got)
	}
	if got := ds.retryBackoff(100); got != maxNetworkRetryBackoff {
		t.Fatalf("large attempt should cap at %v, got %v", maxNetworkRetryBackoff, got)
	}
}

// TestDoCubeLoadRequestDefaultRetryCount documents the intentional divergence:
// retries are enabled by default (unlike the SDK's default of 0).
func TestDoCubeLoadRequestDefaultRetryCount(t *testing.T) {
	ds := &Datasource{}
	if got := ds.networkErrorRetries(); got != defaultNetworkErrorRetries {
		t.Fatalf("expected default %d retries, got %d", defaultNetworkErrorRetries, got)
	}
}
