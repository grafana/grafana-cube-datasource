package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestJSONErrorResponseEscapesSpecialCharacters(t *testing.T) {
	specialErr := errors.New("error with \"quotes\", backslash \\\\, and newline\nhere")
	response := jsonErrorResponse(http.StatusInternalServerError, specialErr)

	if response.Status != http.StatusInternalServerError {
		t.Fatalf("Expected status %d, got %d", http.StatusInternalServerError, response.Status)
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		t.Fatalf("Expected valid JSON error body, got unmarshal error: %v (body: %s)", err, string(response.Body))
	}

	if payload["error"] != specialErr.Error() {
		t.Fatalf("Expected error %q, got %q", specialErr.Error(), payload["error"])
	}

	contentType, ok := response.Headers["Content-Type"]
	if !ok || len(contentType) != 1 || contentType[0] != "application/json" {
		t.Fatalf("Expected Content-Type application/json, got %#v", response.Headers["Content-Type"])
	}
}

func TestExtractMetadataFromResponse(t *testing.T) {
	// Test the metadata extraction logic separately
	ds := &Datasource{}

	metaResponse := &CubeMetaResponse{
		Cubes: []CubeMeta{
			{
				Name:  "order_details",
				Title: "Order Details View",
				Type:  "view",
				Dimensions: []CubeDimension{
					{
						Name:       "order_details.status",
						Title:      "Order Status",
						ShortTitle: "Status",
						Type:       "string",
					},
					{
						Name:       "order_details.customer",
						Title:      "Customer Name",
						ShortTitle: "Customer",
						Type:       "string",
					},
				},
				Measures: []CubeMeasure{
					{
						Name:       "order_details.count",
						Title:      "Orders Count",
						ShortTitle: "Count",
						Type:       "number",
					},
					{
						Name:       "order_details.total",
						Title:      "Orders Total",
						ShortTitle: "Total",
						Type:       "number",
					},
				},
			},
		},
	}

	result := ds.extractMetadataFromResponse(metaResponse)

	// Check dimensions
	if len(result.Dimensions) != 2 {
		t.Fatalf("Expected 2 dimensions, got %d", len(result.Dimensions))
	}

	expectedDimensions := []struct {
		Value string
		Label string
		Type  string
	}{
		{"order_details.status", "order_details.status", "string"},
		{"order_details.customer", "order_details.customer", "string"},
	}
	for i, expected := range expectedDimensions {
		if result.Dimensions[i].Value != expected.Value {
			t.Errorf("Expected dimension %d to be %s, got %s", i, expected.Value, result.Dimensions[i].Value)
		}
		if result.Dimensions[i].Label != expected.Label {
			t.Errorf("Expected dimension %d label to be %s, got %s", i, expected.Label, result.Dimensions[i].Label)
		}
		if result.Dimensions[i].Type != expected.Type {
			t.Errorf("Expected dimension %d type to be %s, got %s", i, expected.Type, result.Dimensions[i].Type)
		}
	}

	// Check measures
	if len(result.Measures) != 2 {
		t.Fatalf("Expected 2 measures, got %d", len(result.Measures))
	}

	expectedMeasures := []struct {
		Value string
		Label string
		Type  string
	}{
		{"order_details.count", "order_details.count", "number"},
		{"order_details.total", "order_details.total", "number"},
	}
	for i, expected := range expectedMeasures {
		if result.Measures[i].Value != expected.Value {
			t.Errorf("Expected measure %d to be %s, got %s", i, expected.Value, result.Measures[i].Value)
		}
		if result.Measures[i].Label != expected.Label {
			t.Errorf("Expected measure %d label to be %s, got %s", i, expected.Label, result.Measures[i].Label)
		}
		if result.Measures[i].Type != expected.Type {
			t.Errorf("Expected measure %d type to be %s, got %s", i, expected.Type, result.Measures[i].Type)
		}
	}
}

func TestHandleMetadata(t *testing.T) {
	// Create a mock server that returns metadata response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify this is a request to the meta endpoint
		if r.URL.Path != "/cubejs-api/v1/meta" {
			t.Errorf("Expected path /cubejs-api/v1/meta, got %s", r.URL.Path)
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		// Return mock Cube meta API response with both cubes and views in single array
		// This tests the filtering logic: only views (type: "view") should be used to avoid duplicates
		response := CubeMetaResponse{
			Cubes: []CubeMeta{
				// Raw cubes - these should be ignored when views are present
				{
					Name:  "orders",
					Title: "Raw Orders",
					Type:  "cube",
					Dimensions: []CubeDimension{
						{
							Name:       "status",
							Title:      "Raw Order Status",
							ShortTitle: "Raw Status",
							Type:       "string",
						},
						{
							Name:       "customer_id",
							Title:      "Customer ID",
							ShortTitle: "Customer ID",
							Type:       "number",
						},
					},
					Measures: []CubeMeasure{
						{
							Name:       "count",
							Title:      "Raw Orders Count",
							ShortTitle: "Raw Count",
							Type:       "number",
						},
					},
				},
				{
					Name:  "customers",
					Title: "Raw Customers",
					Type:  "cube",
					Dimensions: []CubeDimension{
						{
							Name:       "first_name",
							Title:      "Raw Customer First Name",
							ShortTitle: "Raw First Name",
							Type:       "string",
						},
					},
					Measures: []CubeMeasure{
						{
							Name:       "count",
							Title:      "Raw Customers Count",
							ShortTitle: "Raw Count",
							Type:       "number",
						},
					},
				},
				// View - this should be used for tag keys
				{
					Name:  "order_details",
					Title: "Order Details View",
					Type:  "view",
					Dimensions: []CubeDimension{
						{
							Name:       "order_details.status",
							Title:      "Order Status",
							ShortTitle: "Status",
							Type:       "string",
						},
						{
							Name:       "order_details.customers_first_name",
							Title:      "Customer First Name",
							ShortTitle: "First Name",
							Type:       "string",
						},
					},
					Measures: []CubeMeasure{
						{
							Name:       "count",
							Title:      "Orders Count",
							ShortTitle: "Count",
							Type:       "number",
						},
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	// Create datasource with mock server URL
	ds := Datasource{BaseURL: server.URL}

	// Create a mock request with metadata path
	req := &backend.CallResourceRequest{
		Path:   "metadata",
		Method: "GET",
		URL:    "/metadata",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleMetadata, req)

	// Verify we got a successful response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", resp.Status, string(resp.Body))
	}

	// Parse the response and verify it contains the expected metadata
	var metadata MetadataResponse
	if err := json.Unmarshal(resp.Body, &metadata); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Also verify that the raw JSON contains the Type field by parsing as generic JSON
	var genericResponse map[string]interface{}
	if err := json.Unmarshal(resp.Body, &genericResponse); err != nil {
		t.Fatalf("Failed to parse response as generic JSON: %v", err)
	}

	// We should have 2 dimensions from the view (not the raw cubes): order_details.status, order_details.customers_first_name
	// This tests that views are prioritized over cubes to avoid duplicates
	expectedDimensionCount := 2
	if len(metadata.Dimensions) != expectedDimensionCount {
		t.Fatalf("Expected %d dimensions, got %d", expectedDimensionCount, len(metadata.Dimensions))
	}

	// We should have 1 measure from the view: count
	expectedMeasureCount := 1
	if len(metadata.Measures) != expectedMeasureCount {
		t.Fatalf("Expected %d measures, got %d", expectedMeasureCount, len(metadata.Measures))
	}

	// Verify the dimensions contain expected values from the view (not raw cubes)
	expectedDimensions := map[string]struct {
		Label string
		Type  string
	}{
		"order_details.status":               {"order_details.status", "string"},
		"order_details.customers_first_name": {"order_details.customers_first_name", "string"},
	}

	actualDimensions := make(map[string]struct {
		Label string
		Type  string
	})
	for _, dimension := range metadata.Dimensions {
		actualDimensions[dimension.Value] = struct {
			Label string
			Type  string
		}{dimension.Label, dimension.Type}
	}

	for expectedValue, expected := range expectedDimensions {
		if actual, exists := actualDimensions[expectedValue]; !exists {
			t.Errorf("Expected dimension %s not found", expectedValue)
		} else {
			if actual.Label != expected.Label {
				t.Errorf("Expected dimension %s to have label '%s', got '%s'", expectedValue, expected.Label, actual.Label)
			}
			if actual.Type != expected.Type {
				t.Errorf("Expected dimension %s to have type '%s', got '%s'", expectedValue, expected.Type, actual.Type)
			}
		}
	}

	// Verify Type field is present in raw JSON for dimensions
	if dimensions, ok := genericResponse["dimensions"].([]interface{}); ok {
		for i, dim := range dimensions {
			if dimObj, ok := dim.(map[string]interface{}); ok {
				if _, hasType := dimObj["type"]; !hasType {
					t.Errorf("Dimension %d missing 'type' field in JSON response", i)
				}
			}
		}
	}

	// Verify the measures contain expected values
	expectedMeasures := map[string]struct {
		Label string
		Type  string
	}{
		"count": {"count", "number"},
	}

	actualMeasures := make(map[string]struct {
		Label string
		Type  string
	})
	for _, measure := range metadata.Measures {
		actualMeasures[measure.Value] = struct {
			Label string
			Type  string
		}{measure.Label, measure.Type}
	}

	for expectedValue, expected := range expectedMeasures {
		if actual, exists := actualMeasures[expectedValue]; !exists {
			t.Errorf("Expected measure %s not found", expectedValue)
		} else {
			if actual.Label != expected.Label {
				t.Errorf("Expected measure %s to have label '%s', got '%s'", expectedValue, expected.Label, actual.Label)
			}
			if actual.Type != expected.Type {
				t.Errorf("Expected measure %s to have type '%s', got '%s'", expectedValue, expected.Type, actual.Type)
			}
		}
	}

	// Verify Type field is present in raw JSON for measures
	if measures, ok := genericResponse["measures"].([]interface{}); ok {
		for i, measure := range measures {
			if measureObj, ok := measure.(map[string]interface{}); ok {
				if _, hasType := measureObj["type"]; !hasType {
					t.Errorf("Measure %d missing 'type' field in JSON response", i)
				}
			}
		}
	}
}

func TestHandleTagValues(t *testing.T) {
	// Create a mock server that returns load response with dimension values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify this is a request to the load endpoint
		if r.URL.Path != "/cubejs-api/v1/load" {
			t.Errorf("Expected path /cubejs-api/v1/load, got %s", r.URL.Path)
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		// Verify the query parameter contains the expected dimension
		query := r.URL.Query().Get("query")
		if query == "" {
			t.Errorf("Expected query parameter, got none")
			http.Error(w, "Missing query", http.StatusBadRequest)
			return
		}

		// Return mock Cube API response with dimension values
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.status": "completed"},
				{"orders.status": "pending"},
				{"orders.status": "shipped"},
				{"orders.status": "cancelled"},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	// Create datasource with mock server URL
	ds := Datasource{BaseURL: server.URL}

	// Create a mock request with tag-values path and key parameter
	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	// Verify we got a successful response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", resp.Status, string(resp.Body))
	}

	// Parse the response and verify it contains the expected tag values
	var tagValues []TagValue
	if err := json.Unmarshal(resp.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// We should have 4 unique status values
	expectedCount := 4
	if len(tagValues) != expectedCount {
		t.Fatalf("Expected %d tag values, got %d", expectedCount, len(tagValues))
	}

	// Verify the values
	expectedValues := map[string]bool{
		"completed": false,
		"pending":   false,
		"shipped":   false,
		"cancelled": false,
	}

	for _, tv := range tagValues {
		if _, exists := expectedValues[tv.Text]; exists {
			expectedValues[tv.Text] = true
		} else {
			t.Errorf("Unexpected tag value: %s", tv.Text)
		}
	}

	for value, found := range expectedValues {
		if !found {
			t.Errorf("Expected tag value not found: %s", value)
		}
	}
}

func TestHandleTagValuesWithDuplicates(t *testing.T) {
	// Create a mock server that returns data with duplicate values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return mock Cube API response with duplicate values
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.status": "completed"},
				{"orders.status": "pending"},
				{"orders.status": "completed"}, // Duplicate
				{"orders.status": "pending"},   // Duplicate
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	var tagValues []TagValue
	if err := json.Unmarshal(resp.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should only have 2 unique values, not 4
	if len(tagValues) != 2 {
		t.Fatalf("Expected 2 unique tag values, got %d", len(tagValues))
	}
}

func TestHandleTagValuesMissingKey(t *testing.T) {
	ds := Datasource{}

	req := &backend.CallResourceRequest{
		Path:         "tag-values",
		Method:       "GET",
		URL:          "/tag-values",
		PluginContext: newTestPluginContext("http://example.com"),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 400 {
		t.Fatalf("Expected status 400, got %d. Response: %s", resp.Status, string(resp.Body))
	}
}

func TestHandleTagValuesWithNumericValues(t *testing.T) {
	// Create a mock server that returns numeric dimension values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.year": float64(2023)},
				{"orders.year": float64(2024)},
				{"orders.year": float64(2025)},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.year",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	var tagValues []TagValue
	if err := json.Unmarshal(resp.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have 3 years as strings
	if len(tagValues) != 3 {
		t.Fatalf("Expected 3 tag values, got %d", len(tagValues))
	}

	// Verify numeric values are converted to strings
	expectedValues := map[string]bool{"2023": false, "2024": false, "2025": false}
	for _, tv := range tagValues {
		if _, exists := expectedValues[tv.Text]; exists {
			expectedValues[tv.Text] = true
		}
	}

	for value, found := range expectedValues {
		if !found {
			t.Errorf("Expected tag value not found: %s", value)
		}
	}
}

func TestHandleTagValuesWithScopingFilters(t *testing.T) {
	// Create a mock server that verifies the filters are passed to the query
	var capturedQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Capture the query parameter to verify filters are included
		capturedQuery = r.URL.Query().Get("query")

		// Return mock response
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.customer_name": "Alice"},
				{"orders.customer_name": "Bob"},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	// URL-encode the filters JSON
	filtersJSON := `[{"member":"orders.status","operator":"equals","values":["completed"]}]`
	encodedFilters := url.QueryEscape(filtersJSON)

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.customer_name&filters=" + encodedFilters,
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", resp.Status, string(resp.Body))
	}

	// Verify the query includes the scoping filters
	var queryObj map[string]interface{}
	if err := json.Unmarshal([]byte(capturedQuery), &queryObj); err != nil {
		t.Fatalf("Failed to parse captured query: %v", err)
	}

	// Check that filters were included in the query
	filters, ok := queryObj["filters"]
	if !ok {
		t.Fatalf("Expected filters in query, but none found. Query: %s", capturedQuery)
	}

	filtersArray, ok := filters.([]interface{})
	if !ok || len(filtersArray) == 0 {
		t.Fatalf("Expected filters array with elements, got: %v", filters)
	}

	// Verify the filter content
	firstFilter, ok := filtersArray[0].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected filter to be an object, got: %v", filtersArray[0])
	}

	if firstFilter["member"] != "orders.status" {
		t.Errorf("Expected filter member 'orders.status', got: %v", firstFilter["member"])
	}
	if firstFilter["operator"] != "equals" {
		t.Errorf("Expected filter operator 'equals', got: %v", firstFilter["operator"])
	}
}

func TestHandleTagValuesEmptyResponse(t *testing.T) {
	// Create a mock server that returns an empty data array
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return mock Cube API response with empty data
		response := CubeAPIResponse{
			Data: []map[string]interface{}{},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Critical: verify the response is "[]" not "null"
	// This ensures Grafana AdHoc filter dropdown receives an empty array, not null
	responseBody := string(resp.Body)
	if responseBody != "[]" {
		t.Errorf("Expected empty array '[]', got '%s'", responseBody)
	}

	// Also verify it parses as an empty slice
	var tagValues []TagValue
	if err := json.Unmarshal(resp.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if len(tagValues) != 0 {
		t.Errorf("Expected 0 tag values, got %d", len(tagValues))
	}
}

func TestHandleTagValuesContinueWaitThenSuccess(t *testing.T) {
	// Cube returns {"error": "Continue wait"} (HTTP 200) when query results
	// aren't cached yet. The shared doCubeLoadRequest helper should poll until
	// data arrives, meaning handleTagValues should also retry transparently.
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		if requestCount <= 2 {
			// First two requests: Cube is still computing
			_, _ = fmt.Fprintln(w, `{"error": "Continue wait"}`)
			return
		}
		// Third request: data is ready
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.status": "completed"},
				{"orders.status": "pending"},
			},
		}
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{
		BaseURL: server.URL,
	}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Body: %s", resp.Status, string(resp.Body))
	}

	// Verify we actually polled (3 requests total)
	if requestCount != 3 {
		t.Errorf("Expected 3 requests (2 continue-wait + 1 success), got %d", requestCount)
	}

	// Verify correct tag values were returned
	var tagValues []TagValue
	if err := json.Unmarshal(resp.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if len(tagValues) != 2 {
		t.Errorf("Expected 2 tag values, got %d", len(tagValues))
	}
}

func TestHandleTagValuesContinueWaitContextCancelled(t *testing.T) {
	// If the context is cancelled while polling, handleTagValues should
	// return an error response to the sender, not hang forever.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"error": "Continue wait"}`)
	}))
	defer server.Close()

	ds := Datasource{
		BaseURL: server.URL,
	}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	resp := callHandlerWithContext(ctx, t, ds.handleTagValues, req)

	// The response should be an error because we cancelled while waiting
	if resp.Status != 500 {
		t.Fatalf("Expected status 500 (context cancelled), got %d. Body: %s", resp.Status, string(resp.Body))
	}

	// The context expired via WithTimeout (deadline), so the message should say "timed out"
	responseBody := string(resp.Body)
	if !strings.Contains(responseBody, "timed out") {
		t.Errorf("Expected error about timeout, got: %s", responseBody)
	}
}

func TestHandleTagValuesForwardsCubeErrorStatusAndBody(t *testing.T) {
	// Non-200 responses from Cube /v1/load should be forwarded as-is so the
	// frontend receives the original status and error payload.
	expectedBody := `{"error":"Too many requests"}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = fmt.Fprintln(w, expectedBody)
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values?key=orders.status",
		PluginContext: newTestPluginContext(server.URL),
	}

	resp := callHandler(t, ds.handleTagValues, req)

	if resp.Status != http.StatusTooManyRequests {
		t.Fatalf("Expected status %d, got %d. Body: %s", http.StatusTooManyRequests, resp.Status, string(resp.Body))
	}
	if strings.TrimSpace(string(resp.Body)) != expectedBody {
		t.Fatalf("Expected body %s, got %s", expectedBody, string(resp.Body))
	}
}

func TestHandleSQLCompilation(t *testing.T) {
	// Create a mock server that returns SQL compilation response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify this is a request to the SQL endpoint
		if r.URL.Path != "/cubejs-api/v1/sql" {
			t.Errorf("Expected path /cubejs-api/v1/sql, got %s", r.URL.Path)
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		// Parse the query parameter
		query := r.URL.Query().Get("query")
		expectedQuery := `{"measures":["orders.count"],"dimensions":["orders.users_city"]}`
		if query != expectedQuery {
			t.Errorf("Expected query %s, got %s", expectedQuery, query)
		}

		// Return mock Cube SQL API response
		response := CubeSQLResponse{
			SQL: struct {
				SQL []interface{} `json:"sql"`
			}{
				SQL: []interface{}{
					"SELECT\n  \"customers\".city \"orders__users_city\",\n  count(*) \"orders__count\"\nFROM\n  orders AS \"orders\"\n  LEFT JOIN customers AS \"customers\" ON \"orders\".customer_id = customers.id\nGROUP BY\n  1\nORDER BY\n  2 DESC\nLIMIT\n  10000",
					[]interface{}{},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	// Create datasource with mock server URL
	ds := Datasource{BaseURL: server.URL}

	// Create a mock request with the SQL compilation path
	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=" + `{"measures":["orders.count"],"dimensions":["orders.users_city"]}`,
	}

	resp := callHandler(t, ds.handleSQLCompilation, req)

	// Verify we got a successful response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", resp.Status, string(resp.Body))
	}

	// Parse the response and verify it contains the SQL
	var sqlResponse map[string]string
	if err := json.Unmarshal(resp.Body, &sqlResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	expectedSQL := "SELECT\n  \"customers\".city \"orders__users_city\",\n  count(*) \"orders__count\"\nFROM\n  orders AS \"orders\"\n  LEFT JOIN customers AS \"customers\" ON \"orders\".customer_id = customers.id\nGROUP BY\n  1\nORDER BY\n  2 DESC\nLIMIT\n  10000"
	if sqlResponse["sql"] != expectedSQL {
		t.Fatalf("Expected SQL:\n%s\n\nGot:\n%s", expectedSQL, sqlResponse["sql"])
	}
}

func TestHandleSQLCompilationInvalidJSON(t *testing.T) {
	// Create a mock server that should not be called for invalid JSON
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Server should not be called for invalid JSON")
	}))
	defer server.Close()

	ds := Datasource{}

	// Create a mock request with invalid JSON
	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=invalid-json",
	}

	resp := callHandler(t, ds.handleSQLCompilation, req)

	// Verify we got a 400 error for invalid JSON
	if resp.Status != 400 {
		t.Fatalf("Expected status 400, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "invalid query JSON" {
		t.Fatalf("Expected error 'invalid query JSON', got '%s'", errorResponse["error"])
	}
}

func TestHandleSQLCompilationMissingQuery(t *testing.T) {
	ds := Datasource{}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext("http://localhost:4000"),
		Path:          "sql",
		Method:        "GET",
		URL:           "/sql",
	}

	resp := callHandler(t, ds.handleSQLCompilation, req)

	if resp.Status != 400 {
		t.Fatalf("Expected status 400, got %d", resp.Status)
	}

	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "query parameter is required" {
		t.Fatalf("Expected error 'query parameter is required', got '%s'", errorResponse["error"])
	}
}

func TestHandleSQLCompilationWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CallResourceRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{}`),
			},
		},
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=" + `{"measures":["orders.count"]}`,
	}

	resp := callHandler(t, ds.handleSQLCompilation, req)

	// Verify we got a 500 error response (server configuration issue)
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if !strings.Contains(errorResponse["error"], "Cube API URL is required") {
		t.Fatalf("Expected error about URL not configured, got: %s", errorResponse["error"])
	}
}

func TestHandleModelFiles(t *testing.T) {
	// Create a mock server that returns model files
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify the request is to the playground/files endpoint
		if r.URL.Path != "/playground/files" {
			t.Errorf("Expected path /playground/files, got %s", r.URL.Path)
		}

		// Return mock model files response
		response := struct {
			Files []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			} `json:"files"`
		}{
			Files: []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			}{
				{
					FileName: "customers.yml",
					Content: `cubes:
  - name: customers
    sql_table: customers
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true`,
				},
				{
				FileName: "orders.yml",
				Content: `cubes:
  - name: orders
    sql_table: orders
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true`,
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "model-files",
		Method: "GET",
	}

	resp := callHandler(t, ds.handleModelFiles, req)

	// Verify we got a 200 response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Parse and verify the response
	var modelFilesResponse ModelFilesResponse
	if err := json.Unmarshal(resp.Body, &modelFilesResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify we got the expected files
	if len(modelFilesResponse.Files) != 2 {
		t.Fatalf("Expected 2 files, got %d", len(modelFilesResponse.Files))
	}

	// Verify file names
	expectedFiles := []string{"customers.yml", "orders.yml"}
	for i, file := range modelFilesResponse.Files {
		if file.FileName != expectedFiles[i] {
			t.Errorf("Expected file name %s, got %s", expectedFiles[i], file.FileName)
		}
		if file.Content == "" {
			t.Errorf("Expected non-empty content for file %s", file.FileName)
		}
	}
}

func TestHandleDbSchema(t *testing.T) {
	// Create a mock server that returns database schema
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify the request is to the playground/db-schema endpoint
		if r.URL.Path != "/playground/db-schema" {
			t.Errorf("Expected path /playground/db-schema, got %s", r.URL.Path)
		}

		// Return mock database schema response
		response := struct {
			TablesSchema map[string]interface{} `json:"tablesSchema"`
		}{
			TablesSchema: map[string]interface{}{
				"public": map[string]interface{}{
					"customers": []map[string]interface{}{
						{
							"name":       "id",
							"type":       "integer",
							"attributes": []string{},
						},
						{
							"name":       "first_name",
							"type":       "character varying",
							"attributes": []string{},
						},
						{
							"name":       "last_name",
							"type":       "character varying",
							"attributes": []string{},
						},
					},
					"orders": []map[string]interface{}{
						{
							"name":       "id",
							"type":       "integer",
							"attributes": []string{},
						},
						{
							"name":       "customer_id",
							"type":       "integer",
							"attributes": []string{},
						},
						{
							"name":       "status",
							"type":       "character varying",
							"attributes": []string{},
						},
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "db-schema",
		Method: "GET",
	}

	resp := callHandler(t, ds.handleDbSchema, req)

	// Verify we got a 200 response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Parse and verify the response
	var dbSchemaResponse DbSchemaResponse
	if err := json.Unmarshal(resp.Body, &dbSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify we got the expected schema structure
	if dbSchemaResponse.TablesSchema == nil {
		t.Fatalf("Expected tablesSchema to be present")
	}

	// Verify public schema exists
	publicSchema, exists := dbSchemaResponse.TablesSchema["public"]
	if !exists {
		t.Fatalf("Expected public schema to exist")
	}

	// Verify tables exist in public schema
	publicSchemaMap, ok := publicSchema.(map[string]interface{})
	if !ok {
		t.Fatalf("Expected public schema to be a map")
	}

	expectedTables := []string{"customers", "orders"}
	for _, tableName := range expectedTables {
		if _, exists := publicSchemaMap[tableName]; !exists {
			t.Errorf("Expected table %s to exist in public schema", tableName)
		}
	}
}

func TestHandleDbSchemaWithAPIError(t *testing.T) {
	// Create a mock server that returns an error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		if _, err := w.Write([]byte(`{"error": "database connection failed"}`)); err != nil {
			t.Errorf("Failed to write response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "db-schema",
		Method: "GET",
	}

	resp := callHandler(t, ds.handleDbSchema, req)

	// Verify we got a 500 response
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "failed to fetch database schema from Cube API" {
		t.Fatalf("Expected error about fetching database schema, got: %s", errorResponse["error"])
	}
}

func TestHandleDbSchemaWithInvalidJSON(t *testing.T) {
	// Create a mock server that returns invalid JSON
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{invalid json`)); err != nil {
			t.Errorf("Failed to write response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "db-schema",
		Method: "GET",
	}

	resp := callHandler(t, ds.handleDbSchema, req)

	// Verify we got a 500 response
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "failed to fetch database schema from Cube API" {
		t.Fatalf("Expected error about fetching database schema, got: %s", errorResponse["error"])
	}
}

func TestHandleDbSchemaWithMissingURL(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CallResourceRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{}`), // No URL configured
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	resp := callHandler(t, ds.handleDbSchema, req)

	// Verify we got a 500 response
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "failed to fetch database schema from Cube API" {
		t.Fatalf("Expected error about fetching database schema, got: %s", errorResponse["error"])
	}
}

func TestCallResourceDbSchemaRouting(t *testing.T) {
	// Create a mock server that returns database schema
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := struct {
			TablesSchema map[string]interface{} `json:"tablesSchema"`
		}{
			TablesSchema: map[string]interface{}{
				"public": map[string]interface{}{
					"test_table": []map[string]interface{}{
						{
							"name":       "id",
							"type":       "integer",
							"attributes": []string{},
						},
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "db-schema",
		Method: "GET",
	}

	// Test that CallResource correctly routes to handleDbSchema
	resp := callHandler(t, ds.CallResource, req)

	// Verify we got a 200 response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Verify the response contains expected schema data
	var dbSchemaResponse DbSchemaResponse
	if err := json.Unmarshal(resp.Body, &dbSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if dbSchemaResponse.TablesSchema == nil {
		t.Errorf("Expected tablesSchema to be present")
	}
}

func TestHandleGenerateSchema(t *testing.T) {
	// Create a mock server that returns generated schema files
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify the request is to the playground/generate-schema endpoint
		if r.URL.Path != "/playground/generate-schema" {
			t.Errorf("Expected path /playground/generate-schema, got %s", r.URL.Path)
		}

		// Verify it's a POST request
		if r.Method != "POST" {
			t.Errorf("Expected POST method, got %s", r.Method)
		}

		// Verify Content-Type header
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}

		// Parse and verify request body
		var requestBody GenerateSchemaRequest
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("Failed to decode request body: %v", err)
		}

		// Verify request structure
		if requestBody.Format != "yaml" {
			t.Errorf("Expected format yaml, got %s", requestBody.Format)
		}

		if len(requestBody.Tables) == 0 {
			t.Errorf("Expected tables to be present")
		}

		if requestBody.TablesSchema == nil {
			t.Errorf("Expected tablesSchema to be present")
		}

		// Return mock generated schema response
		response := struct {
			Files []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			} `json:"files"`
		}{
			Files: []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			}{
				{
					FileName: "customers.yml",
					Content: `cubes:
  - name: customers
    sql_table: public.customers
    data_source: default

    joins: []

    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true

      - name: first_name
        sql: first_name
        type: string

      - name: last_name
        sql: last_name
        type: string

    measures:
      - name: count
        type: count

    pre_aggregations:
      # Pre-aggregation definitions go here.
      # Learn more in the documentation: https://cube.dev/docs/caching/pre-aggregations/getting-started

`,
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	requestBody := GenerateSchemaRequest{
		Format: "yaml",
		Tables: [][]string{{"public", "customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"customers": []map[string]interface{}{
					{
						"name":       "first_name",
						"type":       "character varying",
						"attributes": []string{},
					},
					{
						"name":       "id",
						"type":       "integer",
						"attributes": []string{},
					},
					{
						"name":       "last_name",
						"type":       "character varying",
						"attributes": []string{},
					},
				},
			},
		},
	}

	requestBodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		t.Fatalf("Failed to marshal request body: %v", err)
	}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	resp := callHandler(t, ds.handleGenerateSchema, req)

	// Verify we got a 200 response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Parse and verify the response
	var generateSchemaResponse GenerateSchemaResponse
	if err := json.Unmarshal(resp.Body, &generateSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify we got the expected schema files
	if len(generateSchemaResponse.Files) != 1 {
		t.Fatalf("Expected 1 file, got %d", len(generateSchemaResponse.Files))
	}

	file := generateSchemaResponse.Files[0]
	if file.FileName != "customers.yml" {
		t.Errorf("Expected fileName customers.yml, got %s", file.FileName)
	}

	if file.Content == "" {
		t.Errorf("Expected file content to be present")
	}

	// Verify the content contains expected YAML structure
	expectedContent := "cubes:"
	if !strings.Contains(file.Content, expectedContent) {
		t.Errorf("Expected content to contain '%s'", expectedContent)
	}
}

func TestHandleGenerateSchemaWithInvalidMethod(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CallResourceRequest{
		Path:   "generate-schema",
		Method: "GET", // Should be POST
	}

	resp := callHandler(t, ds.handleGenerateSchema, req)

	// Verify we got a 405 response
	if resp.Status != 405 {
		t.Fatalf("Expected status 405, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "method not allowed" {
		t.Fatalf("Expected error about method not allowed, got: %s", errorResponse["error"])
	}
}

func TestHandleGenerateSchemaWithInvalidJSON(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CallResourceRequest{
		Path:   "generate-schema",
		Method: "POST",
		Body:   []byte(`{invalid json`), // Invalid JSON
	}

	resp := callHandler(t, ds.handleGenerateSchema, req)

	// Verify we got a 400 response
	if resp.Status != 400 {
		t.Fatalf("Expected status 400, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "invalid request body" {
		t.Fatalf("Expected error about invalid request body, got: %s", errorResponse["error"])
	}
}

func TestHandleGenerateSchemaWithAPIError(t *testing.T) {
	// Create a mock server that returns an error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "internal server error"}`))
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	requestBody := GenerateSchemaRequest{
		Format: "yaml",
		Tables: [][]string{{"public", "customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"customers": []map[string]interface{}{
					{
						"name":       "id",
						"type":       "integer",
						"attributes": []string{},
					},
				},
			},
		},
	}

	requestBodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		t.Fatalf("Failed to marshal request body: %v", err)
	}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	resp := callHandler(t, ds.handleGenerateSchema, req)

	// Verify we got a 500 response
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "failed to generate schema from Cube API" {
		t.Fatalf("Expected error about generating schema, got: %s", errorResponse["error"])
	}
}

func TestHandleGenerateSchemaWithInvalidAPIResponse(t *testing.T) {
	// Create a mock server that returns invalid JSON
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{invalid json`))
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	requestBody := GenerateSchemaRequest{
		Format: "yaml",
		Tables: [][]string{{"public", "customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"customers": []map[string]interface{}{
					{
						"name":       "id",
						"type":       "integer",
						"attributes": []string{},
					},
				},
			},
		},
	}

	requestBodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		t.Fatalf("Failed to marshal request body: %v", err)
	}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	resp := callHandler(t, ds.handleGenerateSchema, req)

	// Verify we got a 500 response
	if resp.Status != 500 {
		t.Fatalf("Expected status 500, got %d", resp.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(resp.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "failed to generate schema from Cube API" {
		t.Fatalf("Expected error about generating schema, got: %s", errorResponse["error"])
	}
}

func TestCallResourceGenerateSchemaRouting(t *testing.T) {
	// Create a mock server that returns generated schema files
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := struct {
			Files []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			} `json:"files"`
		}{
			Files: []struct {
				FileName string `json:"fileName"`
				Content  string `json:"content"`
			}{
				{
					FileName: "test_table.yml",
					Content:  "cubes:\n  - name: test_table\n    sql_table: public.test_table\n",
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	ds := &Datasource{BaseURL: server.URL}

	requestBody := GenerateSchemaRequest{
		Format: "yaml",
		Tables: [][]string{{"public", "test_table"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"test_table": []map[string]interface{}{
					{
						"name":       "id",
						"type":       "integer",
						"attributes": []string{},
					},
				},
			},
		},
	}

	requestBodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		t.Fatalf("Failed to marshal request body: %v", err)
	}

	req := &backend.CallResourceRequest{
		PluginContext: newTestPluginContext(server.URL),
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	// Test that CallResource correctly routes to handleGenerateSchema
	resp := callHandler(t, ds.CallResource, req)

	// Verify we got a 200 response
	if resp.Status != 200 {
		t.Fatalf("Expected status 200, got %d", resp.Status)
	}

	// Verify the response contains expected schema data
	var generateSchemaResponse GenerateSchemaResponse
	if err := json.Unmarshal(resp.Body, &generateSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if len(generateSchemaResponse.Files) == 0 {
		t.Errorf("Expected files to be present")
	}
}
