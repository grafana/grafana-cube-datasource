package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/grafana/cube/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

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

// doCubeLoadRequest makes a GET request to Cube's /v1/load endpoint, handling the
// "Continue wait" polling protocol. Cube returns {"error": "Continue wait"} (HTTP 200)
// when query results aren't cached yet (e.g. the upstream warehouse is still computing).
// This method retries immediately until actual data arrives or the context is cancelled, matching the
// behavior of the official @cubejs-client/core SDK.
func (d *Datasource) doCubeLoadRequest(ctx context.Context, requestURL string, config *models.PluginSettings) ([]byte, error) {
	pollStart := time.Now()
	pollRetries := 0
	var lastContinueWaitProgress continueWaitProgress
	haveContinueWaitProgress := false
	for {
		req, err := http.NewRequestWithContext(ctx, "GET", requestURL, nil)
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
			if errors.Is(err, context.DeadlineExceeded) {
				elapsed := time.Since(pollStart).Round(time.Millisecond)
				msg := fmt.Sprintf("request to Cube API timed out after %s (the upstream warehouse may still be computing)", elapsed)
				if haveContinueWaitProgress && (lastContinueWaitProgress.Stage != "" || lastContinueWaitProgress.TimeElapsed > 0) {
					msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, lastContinueWaitProgress.Stage, int(lastContinueWaitProgress.TimeElapsed))
				}
				return nil, fmt.Errorf("%s", msg)
			}
			if errors.Is(err, context.Canceled) {
				msg := "query cancelled while waiting for Cube to compute results"
				if haveContinueWaitProgress && (lastContinueWaitProgress.Stage != "" || lastContinueWaitProgress.TimeElapsed > 0) {
					msg = fmt.Sprintf("%s (stage: %s, Cube timeElapsed: %ds)", msg, lastContinueWaitProgress.Stage, int(lastContinueWaitProgress.TimeElapsed))
				}
				return nil, fmt.Errorf("%s", msg)
			}
			return nil, fmt.Errorf("failed to make API request: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			errorBody, _ := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
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
				backend.Logger.Info("Cube query not yet ready, polling for results", "url", requestURL)
			}
			pollRetries++
			backend.Logger.Debug("Cube returned 'Continue wait', polling again",
				"url", requestURL, "attempt", pollRetries,
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
			backend.Logger.Info("Cube query results ready after polling", "url", requestURL, "retries", pollRetries, "duration", time.Since(pollStart).Round(time.Millisecond))
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
