package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
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

// hijackAndClose drops the current connection so client.Do returns a network
// error. It runs on the httptest server goroutine, so it must not touch *testing.T.
func hijackAndClose(w http.ResponseWriter) {
	if hj, ok := w.(http.Hijacker); ok {
		if conn, _, err := hj.Hijack(); err == nil {
			_ = conn.Close()
		}
	}
}

// TestDoCubeLoadRequestRetriesOn502 verifies the bounded transient retry: Cube
// returns HTTP 502 twice, then 200.
func TestDoCubeLoadRequestRetriesOn502(t *testing.T) {
	var requestCount atomic.Int32
	body := successBody(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requestCount.Add(1) <= 2 {
			http.Error(w, "bad gateway", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, networkRetryBackoffBase: time.Millisecond}

	got, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{"measures":["orders.count"]}`), devConfig())
	if err != nil {
		t.Fatalf("expected success after 502 retries, got: %v", err)
	}
	if n := requestCount.Load(); n != 3 {
		t.Fatalf("expected 3 requests (2x502 + success), got %d", n)
	}
	if len(got) == 0 {
		t.Fatal("expected non-empty body")
	}
}

// TestDoCubeLoadRequestExhaustsRetriesReturns502 verifies that after the retry
// budget is exhausted, the upstream 502 status + body are preserved.
func TestDoCubeLoadRequestExhaustsRetriesReturns502(t *testing.T) {
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
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
	if n := requestCount.Load(); n != 3 {
		t.Fatalf("expected 3 requests (1 + 2 retries), got %d", n)
	}
}

// TestDoCubeLoadRequestDoesNotRetryNonRetryableStatus verifies that a non-502
// error status (e.g. 400) is surfaced immediately without retrying and with the
// upstream status/body preserved.
func TestDoCubeLoadRequestDoesNotRetryNonRetryableStatus(t *testing.T) {
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
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
	if n := requestCount.Load(); n != 1 {
		t.Fatalf("expected exactly 1 request (no retry on 400), got %d", n)
	}
}

// TestDoCubeLoadRequestRetriesOnNetworkError verifies that a transient transport
// failure (connection dropped without a response) is retried. The first
// request's connection is dropped; subsequent requests succeed.
func TestDoCubeLoadRequestRetriesOnNetworkError(t *testing.T) {
	var requestCount atomic.Int32
	body := successBody(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requestCount.Add(1) == 1 {
			hijackAndClose(w)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, networkRetryBackoffBase: time.Millisecond}

	got, err := ds.doCubeLoadRequest(context.Background(), server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err != nil {
		t.Fatalf("expected success after network-error retry, got: %v", err)
	}
	if n := requestCount.Load(); n < 2 {
		t.Fatalf("expected at least 2 requests (1 network failure + success), got %d", n)
	}
	if len(got) == 0 {
		t.Fatal("expected non-empty body")
	}
}

// TestDoCubeLoadRequestNetworkErrorRetriesDisabled verifies that when retries
// are disabled (maxNetworkRetries=0), a transport failure is surfaced
// immediately rather than retried (SDK-default behavior).
func TestDoCubeLoadRequestNetworkErrorRetriesDisabled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hijackAndClose(w)
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
	// Network connectivity failure maps to StatusBadGateway (502), not 400.
	var reqErr *loadRequestError
	if !errors.As(err, &reqErr) {
		t.Fatalf("expected *loadRequestError, got %T: %v", err, err)
	}
	if reqErr.status != 502 {
		t.Fatalf("expected StatusBadGateway (502) for network failure, got %d", reqErr.status)
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
		{"wrapped deadline msg only", errors.New("x: " + context.DeadlineExceeded.Error()), transportNetworkError},
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

// TestNetworkErrorRetriesResolution documents the intentional divergence and the
// jsonData wiring: retries default to defaultNetworkErrorRetries (unlike the
// SDK's default of 0), the operator-facing config overrides it (0 = SDK
// default), and the test-only field takes highest precedence.
func TestNetworkErrorRetriesResolution(t *testing.T) {
	ds := &Datasource{}
	if got := ds.networkErrorRetriesFor(nil); got != defaultNetworkErrorRetries {
		t.Fatalf("nil config: expected default %d, got %d", defaultNetworkErrorRetries, got)
	}
	if got := ds.networkErrorRetriesFor(&models.PluginSettings{}); got != defaultNetworkErrorRetries {
		t.Fatalf("unset config: expected default %d, got %d", defaultNetworkErrorRetries, got)
	}
	if got := ds.networkErrorRetriesFor(&models.PluginSettings{NetworkErrorRetries: intPtr(0)}); got != 0 {
		t.Fatalf("config 0 (SDK default): expected 0, got %d", got)
	}
	if got := ds.networkErrorRetriesFor(&models.PluginSettings{NetworkErrorRetries: intPtr(7)}); got != 7 {
		t.Fatalf("config 7: expected 7, got %d", got)
	}
	// Test-only override wins over config.
	ds.maxNetworkRetries = intPtr(1)
	if got := ds.networkErrorRetriesFor(&models.PluginSettings{NetworkErrorRetries: intPtr(7)}); got != 1 {
		t.Fatalf("override: expected 1, got %d", got)
	}
	ds.maxNetworkRetries = nil
	// Negative config clamps to 0.
	if got := ds.networkErrorRetriesFor(&models.PluginSettings{NetworkErrorRetries: intPtr(-5)}); got != 0 {
		t.Fatalf("negative config clamps to 0, got %d", got)
	}
}

// TestDoCubeLoadRequestTimeoutNotRetried verifies that a context-deadline
// timeout is NOT retried (retrying can't beat an already-expired deadline) and
// is surfaced as a timeout with StatusTimeout. Mirrors the SDK's "timeout"
// category, which is not part of networkErrorRetries.
func TestDoCubeLoadRequestTimeoutNotRetried(t *testing.T) {
	var requestCount atomic.Int32
	body := successBody(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		time.Sleep(200 * time.Millisecond) // outlast the context deadline
		_, _ = w.Write(body)
	}))
	defer server.Close()

	// Generous retry budget; a timeout must still not consume it.
	ds := &Datasource{BaseURL: server.URL, maxNetworkRetries: intPtr(5), networkRetryBackoffBase: time.Millisecond}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, err := ds.doCubeLoadRequest(ctx, server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected timeout error")
	}
	var reqErr *loadRequestError
	if !errors.As(err, &reqErr) {
		t.Fatalf("expected *loadRequestError, got %T: %v", err, err)
	}
	if reqErr.status != 504 { // backend.StatusTimeout
		t.Fatalf("expected StatusTimeout (504), got %d", reqErr.status)
	}
	if n := requestCount.Load(); n != 1 {
		t.Fatalf("timeout must not be retried; expected 1 request, got %d", n)
	}
}

// TestDoCubeLoadRequestCancelledDuringNetworkBackoff verifies that cancelling
// the context while sleeping between transient network-error retries surfaces a
// cancellation error (not a stale/generic error).
func TestDoCubeLoadRequestCancelledDuringNetworkBackoff(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hijackAndClose(w)
	}))
	defer server.Close()

	// Long backoff so the cancellation lands during the sleep, not between requests.
	ds := &Datasource{BaseURL: server.URL, maxNetworkRetries: intPtr(5), networkRetryBackoffBase: 10 * time.Second}

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	_, err := ds.doCubeLoadRequest(ctx, server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected cancellation/timeout error")
	}
	var reqErr *loadRequestError
	if !errors.As(err, &reqErr) {
		t.Fatalf("expected *loadRequestError from interrupted backoff, got %T: %v", err, err)
	}
	if !strings.Contains(reqErr.Error(), "timed out") && !strings.Contains(reqErr.Error(), "cancelled") {
		t.Fatalf("expected timeout/cancel message, got: %s", reqErr.Error())
	}
}

// TestDoCubeLoadRequestCancelledDuring502Backoff verifies the 502 backoff path
// is consistent with the network path: cancellation during the sleep surfaces a
// cancellation/timeout error, not the stale CubeAPIError{502}.
func TestDoCubeLoadRequestCancelledDuring502Backoff(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad gateway", http.StatusBadGateway)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL, maxNetworkRetries: intPtr(5), networkRetryBackoffBase: 10 * time.Second}

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()

	_, err := ds.doCubeLoadRequest(ctx, server.URL+"/cubejs-api/v1/load", []byte(`{}`), devConfig())
	if err == nil {
		t.Fatal("expected cancellation/timeout error")
	}
	var cubeErr *CubeAPIError
	if errors.As(err, &cubeErr) {
		t.Fatalf("cancellation during 502 backoff should not return stale CubeAPIError, got %v", err)
	}
	var reqErr *loadRequestError
	if !errors.As(err, &reqErr) {
		t.Fatalf("expected *loadRequestError, got %T: %v", err, err)
	}
}

// TestClassifiedTransportStatuses verifies the status mapping for transport
// failures (not client 400s).
func TestClassifiedTransportStatuses(t *testing.T) {
	if got := statusForContextErr(context.DeadlineExceeded); got != 504 {
		t.Fatalf("deadline should map to StatusTimeout (504), got %d", got)
	}
	if got := statusForContextErr(context.Canceled); got != 500 {
		t.Fatalf("cancel should map to StatusInternal (500), got %d", got)
	}
}
