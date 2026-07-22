package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/grafana/cube/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// urlLengthLimit mirrors URL_LENGTH_LIMIT in @cubejs-client/core's HttpTransport.
// The SDK sends /v1/load requests via GET with the query URL-encoded in the
// query string, but switches to POST (query in a JSON body) once the full URL
// reaches this length. Without the fallback, large queries (e.g. a filter with
// hundreds of values) blow past server-side URL/header limits — Node.js rejects
// request lines + headers over ~16KB with "431 Request Header Fields Too Large".
const urlLengthLimit = 2000

// Bounded retry configuration for transient transport failures on the /v1/load
// path.
//
// Parity note — this covers two distinct behaviors in @cubejs-client/core's
// loadMethod (index.ts ~L363). Because JS `&&` binds tighter than `||`, that
// condition parses as:
//
//	(status === 502) || (error === 'network error' && --networkRetries >= 0)
//
// i.e. the SDK retries HTTP 502 UNCONDITIONALLY (even when networkErrorRetries
// is 0), and retries transport "network error" only while the retry budget
// lasts. Both wait pollInterval between attempts.
//
// This backend deliberately does NOT copy that split:
//   - Network-error retries: enabled by default (INTENTIONAL DIVERGENCE from the
//     SDK's opt-in default of 0) because a Grafana backend has no embedding app
//     to configure networkErrorRetries and dashboards fan out many queries.
//     Configurable via the `networkErrorRetries` jsonData setting (0 = SDK default).
//   - 502 retries: also bounded by the same budget (INTENTIONAL DIVERGENCE from
//     the SDK's unbounded 502 retry, which stems from the `&&`/`||` precedence
//     above). A permanently-502 upstream should surface as an error rather than
//     loop forever.
//
// See docs/sdk-parity.md (divergence log).
const (
	defaultNetworkErrorRetries = 3
	defaultNetworkRetryBackoff = 500 * time.Millisecond
	maxNetworkRetryBackoff     = 5 * time.Second
)

// loadRequestError carries a user-facing message together with the Grafana
// backend status that best represents a transport-level failure, so the query
// path can preserve status fidelity instead of collapsing every failure to 400.
type loadRequestError struct {
	status backend.Status
	msg    string
}

func (e *loadRequestError) Error() string { return e.msg }

// statusForContextErr maps a context error to a backend status. A deadline is a
// gateway timeout; a cancellation (or anything else) has no server-fault status,
// so we follow the SDK's statusFromError convention of treating unclassified
// errors as Internal.
func statusForContextErr(err error) backend.Status {
	if errors.Is(err, context.DeadlineExceeded) {
		return backend.StatusTimeout
	}
	return backend.StatusInternal
}

// transportErrorKind classifies a transport-level failure from client.Do,
// mirroring the timeout/aborted/network-error categories the SDK's HttpTransport
// distinguishes (AbortSignal timeout vs. manual abort vs. everything else).
type transportErrorKind int

const (
	// transportNetworkError is a generic, typically transient transport failure
	// (connection refused, reset, DNS, EOF). Retryable, like the SDK's
	// "network error" category.
	transportNetworkError transportErrorKind = iota
	// transportTimeout is a context-deadline timeout. Not retryable (the
	// deadline has already passed). Mirrors the SDK's "timeout" category.
	transportTimeout
	// transportAborted is an explicit cancellation. Not retryable. Mirrors the
	// SDK's "aborted" category.
	transportAborted
)

// classifyTransportError maps a client.Do error to a transportErrorKind.
func classifyTransportError(err error) transportErrorKind {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return transportTimeout
	case errors.Is(err, context.Canceled):
		return transportAborted
	default:
		return transportNetworkError
	}
}

// networkErrorRetriesFor returns the bounded retry count for transient transport
// failures. Precedence: a test-only override on the Datasource, then the
// operator-configured `networkErrorRetries` jsonData setting (0 mirrors the SDK
// default), then defaultNetworkErrorRetries.
func (d *Datasource) networkErrorRetriesFor(config *models.PluginSettings) int {
	if d.maxNetworkRetries != nil {
		return clampRetries(*d.maxNetworkRetries)
	}
	if config != nil && config.NetworkErrorRetries != nil {
		return clampRetries(*config.NetworkErrorRetries)
	}
	return defaultNetworkErrorRetries
}

func clampRetries(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

// retryBackoff returns the backoff duration before the given (zero-based) retry
// attempt, using exponential growth from the base interval capped at
// maxNetworkRetryBackoff.
func (d *Datasource) retryBackoff(attempt int) time.Duration {
	base := d.networkRetryBackoffBase
	if base <= 0 {
		base = defaultNetworkRetryBackoff
	}
	backoff := base
	for i := 0; i < attempt; i++ {
		backoff *= 2
		if backoff >= maxNetworkRetryBackoff {
			return maxNetworkRetryBackoff
		}
	}
	return backoff
}

// sleepWithContext waits for d, returning the context error if the context is
// cancelled first. A non-positive duration still honours cancellation.
func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			return nil
		}
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// interruptedWaitError builds a user-friendly error for when the context is
// cancelled or times out while waiting on Cube (during polling or retry
// backoff), enriched with the last known Continue-wait progress when available.
func interruptedWaitError(ctxErr error, progress continueWaitProgress, haveProgress bool) error {
	var msg string
	if errors.Is(ctxErr, context.DeadlineExceeded) {
		msg = "Cube API request timed out while waiting for results to be computed"
	} else {
		msg = "query cancelled while waiting for Cube to compute results"
	}
	if haveProgress && (progress.Stage != "" || progress.TimeElapsed > 0) {
		msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, progress.Stage, int(progress.TimeElapsed))
	}
	return &loadRequestError{status: statusForContextErr(ctxErr), msg: msg}
}

// CubeAPIError represents a non-200 HTTP response from the Cube API.
// It preserves the original status code and body so callers (e.g. handleTagValues)
// can forward them to the frontend instead of collapsing everything to 500.
type CubeAPIError struct {
	StatusCode int
	Body       []byte
}

func (e *CubeAPIError) Error() string {
	return fmt.Sprintf("API request failed with status %d: %s", e.StatusCode, string(e.Body))
}

// doCubeLoadRequest sends a query to Cube's /v1/load endpoint, handling the
// "Continue wait" polling protocol. Cube returns {"error": "Continue wait"} (HTTP 200)
// when query results aren't cached yet (e.g. the upstream warehouse is still computing).
// This method retries immediately until actual data arrives or the context is cancelled, matching the
// behavior of the official @cubejs-client/core SDK.
//
// Continue-wait polling cadence: the SDK retries Continue-wait immediately too
// (index.ts loadMethod calls continueWait() with wait=false; only network-error
// retries pass wait=true and sleep pollInterval). The pacing comes from the
// server: Cube's query queue long-polls up to continueWaitTimeout seconds
// (default 10s, see cubejs-query-orchestrator QueryQueue) before returning
// {"error":"Continue wait"}, so each HTTP round-trip already blocks server-side.
// Adding a client-side delay would double-pace and add latency, so we mirror the
// SDK and retry immediately. This is SDK-aligned, not a divergence.
//
// SDK alignment: like @cubejs-client/core, the query is sent via GET with the
// query JSON URL-encoded in the query string while the full URL stays under
// urlLengthLimit, and via POST with a {"query": ...} JSON body otherwise.
func (d *Datasource) doCubeLoadRequest(ctx context.Context, loadURL string, queryJSON []byte, config *models.PluginSettings) ([]byte, error) {
	params := url.Values{}
	params.Add("query", string(queryJSON))
	getURL := loadURL + "?" + params.Encode()

	usePost := len(getURL) >= urlLengthLimit
	var postBody []byte
	if usePost {
		var err error
		postBody, err = json.Marshal(map[string]json.RawMessage{"query": queryJSON})
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
	}

	pollStart := time.Now()
	pollRetries := 0
	networkRetriesLeft := d.networkErrorRetriesFor(config)
	networkAttempt := 0
	var lastContinueWaitProgress continueWaitProgress
	haveContinueWaitProgress := false
	for {
		var req *http.Request
		var err error
		if usePost {
			req, err = http.NewRequestWithContext(ctx, "POST", loadURL, bytes.NewReader(postBody))
		} else {
			req, err = http.NewRequestWithContext(ctx, "GET", getURL, nil)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		if err := d.addAuthHeaders(req, config); err != nil {
			return nil, fmt.Errorf("failed to add auth headers: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			switch classifyTransportError(err) {
			case transportTimeout:
				elapsed := time.Since(pollStart).Round(time.Millisecond)
				msg := fmt.Sprintf("request to Cube API timed out after %s (the upstream warehouse may still be computing)", elapsed)
				if haveContinueWaitProgress && (lastContinueWaitProgress.Stage != "" || lastContinueWaitProgress.TimeElapsed > 0) {
					msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, lastContinueWaitProgress.Stage, int(lastContinueWaitProgress.TimeElapsed))
				}
				return nil, &loadRequestError{status: backend.StatusTimeout, msg: msg}
			case transportAborted:
				msg := "query cancelled while waiting for Cube to compute results"
				if haveContinueWaitProgress && (lastContinueWaitProgress.Stage != "" || lastContinueWaitProgress.TimeElapsed > 0) {
					msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, lastContinueWaitProgress.Stage, int(lastContinueWaitProgress.TimeElapsed))
				}
				return nil, &loadRequestError{status: backend.StatusInternal, msg: msg}
			default: // transportNetworkError
				// Bounded retry for transient network failures, mirroring the
				// SDK's networkErrorRetries ("network error" category).
				if networkRetriesLeft > 0 {
					networkRetriesLeft--
					backoff := d.retryBackoff(networkAttempt)
					networkAttempt++
					backend.Logger.Warn("Cube API request failed with transient network error, retrying",
						"url", loadURL, "backoff", backoff, "error", err)
					if waitErr := sleepWithContext(ctx, backoff); waitErr != nil {
						return nil, interruptedWaitError(waitErr, lastContinueWaitProgress, haveContinueWaitProgress)
					}
					continue
				}
				// Network connectivity failure (not a client error): map to 502.
				return nil, &loadRequestError{status: backend.StatusBadGateway, msg: fmt.Sprintf("failed to make API request: %v", err)}
			}
		}

		if resp.StatusCode != http.StatusOK {
			errorBody, _ := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			// Bounded retry for transient HTTP 502 responses. INTENTIONAL
			// DIVERGENCE: the SDK retries 502 UNCONDITIONALLY (see precedence note
			// on the retry constants); we cap it with the same budget so a
			// permanently-502 upstream fails instead of looping forever. Other
			// non-200 statuses are surfaced immediately with their upstream
			// status + body preserved.
			if resp.StatusCode == http.StatusBadGateway && networkRetriesLeft > 0 {
				networkRetriesLeft--
				backoff := d.retryBackoff(networkAttempt)
				networkAttempt++
				backend.Logger.Warn("Cube API returned 502 Bad Gateway, retrying",
					"url", loadURL, "backoff", backoff)
				if waitErr := sleepWithContext(ctx, backoff); waitErr != nil {
					// Cancelled/timed out during backoff: surface the
					// cancellation/timeout, consistent with the network-error path.
					return nil, interruptedWaitError(waitErr, lastContinueWaitProgress, haveContinueWaitProgress)
				}
				continue
			}
			return nil, &CubeAPIError{StatusCode: resp.StatusCode, Body: errorBody}
		}

		body, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read response body: %w", err)
		}

		if isContinueWait(body) {
			// Parse progress info from the response for logging and error messages.
			// Cube returns {"error": "Continue wait", "stage": "...", "timeElapsed": N}
			progress := parseContinueWaitProgress(body)
			lastContinueWaitProgress = progress
			haveContinueWaitProgress = true

			if pollRetries == 0 {
				backend.Logger.Info("Cube query not yet ready, polling for results", "url", loadURL)
			}
			pollRetries++
			backend.Logger.Debug("Cube returned 'Continue wait', polling again",
				"url", loadURL, "attempt", pollRetries,
				"stage", progress.Stage, "cubeTimeElapsed", progress.TimeElapsed)
			select {
			case <-ctx.Done():
				var msg string
				if errors.Is(ctx.Err(), context.DeadlineExceeded) {
					msg = "Cube API request timed out while waiting for results to be computed"
				} else {
					msg = "query cancelled while waiting for Cube to compute results"
				}
				if progress.Stage != "" || progress.TimeElapsed > 0 {
					msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, progress.Stage, int(progress.TimeElapsed))
				}
				return nil, fmt.Errorf("%s", msg)
			default:
				continue
			}
		}

		if pollRetries > 0 {
			backend.Logger.Info("Cube query results ready after polling", "url", loadURL, "retries", pollRetries, "duration", time.Since(pollStart).Round(time.Millisecond))
		}

		return body, nil
	}
}

// isContinueWait checks whether a Cube API response body is a "Continue wait"
// polling response. Cube returns {"error": "Continue wait"} (HTTP 200) when
// the query result is not yet ready (e.g. the upstream warehouse is still
// computing). The caller is expected to retry until actual data arrives.
func isContinueWait(body []byte) bool {
	var probe struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return false
	}
	return probe.Error == "Continue wait"
}

// continueWaitProgress holds progress information from a Cube "Continue wait" response.
type continueWaitProgress struct {
	Stage       string  `json:"stage"`
	TimeElapsed float64 `json:"timeElapsed"`
}

// parseContinueWaitProgress extracts stage and timeElapsed from a Cube
// "Continue wait" response body. Returns zero values if fields are missing.
func parseContinueWaitProgress(body []byte) continueWaitProgress {
	var progress continueWaitProgress
	_ = json.Unmarshal(body, &progress)
	return progress
}

// CubeAPIResponse represents the response structure from Cube API
type CubeAPIResponse struct {
	Data       []map[string]interface{} `json:"data"`
	Annotation CubeAnnotation           `json:"annotation"`
}

// CubeAnnotation represents the type information from Cube API
type CubeAnnotation struct {
	Measures       map[string]CubeFieldInfo `json:"measures"`
	Dimensions     map[string]CubeFieldInfo `json:"dimensions"`
	Segments       map[string]CubeFieldInfo `json:"segments"`
	TimeDimensions map[string]CubeFieldInfo `json:"timeDimensions"`
}

// CubeFieldInfo represents the metadata for a field
type CubeFieldInfo struct {
	Title      string `json:"title"`
	ShortTitle string `json:"shortTitle"`
	Type       string `json:"type"`
}

// fetchCubeMetadata fetches metadata from Cube's /v1/meta endpoint
func (d *Datasource) fetchCubeMetadata(ctx context.Context, pluginContext backend.PluginContext) (*CubeMetaResponse, error) {
	// Build API URL and load configuration
	apiReq, err := d.buildAPIURL(pluginContext, "meta")
	if err != nil {
		return nil, err
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", apiReq.URL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if err := d.addAuthHeaders(req, apiReq.Config); err != nil {
		return nil, fmt.Errorf("failed to add auth headers: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	// Make the HTTP request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make API request: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			backend.Logger.Warn("Failed to close response body", "error", err)
		}
	}()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		errorBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(errorBody))
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Parse the API response
	var metaResponse CubeMetaResponse
	if err := json.Unmarshal(body, &metaResponse); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	return &metaResponse, nil
}

// CubeMetaResponse represents the response from Cube's /v1/meta endpoint
type CubeMetaResponse struct {
	Cubes []CubeMeta `json:"cubes"` // Contains both cubes and views, distinguished by the Type field
}

// CubeMeta represents metadata for a single cube or view
type CubeMeta struct {
	Name       string          `json:"name"`
	Title      string          `json:"title"`
	Type       string          `json:"type"` // "cube" or "view"
	Dimensions []CubeDimension `json:"dimensions"`
	Measures   []CubeMeasure   `json:"measures"`
}

// CubeDimension represents a dimension in a cube
type CubeDimension struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	ShortTitle  string `json:"shortTitle"`
	Description string `json:"description"`
}

// CubeMeasure represents a measure in a cube
type CubeMeasure struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	ShortTitle  string `json:"shortTitle"`
	Description string `json:"description"`
}
