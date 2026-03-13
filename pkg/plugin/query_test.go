package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func TestQueryData(t *testing.T) {
	// Create a mock server that returns empty data for an empty query
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Parse the query parameter to validate it's empty
		query := r.URL.Query().Get("query")
		if query != "{}" {
			t.Errorf("Expected empty query {}, got %s", query)
		}

		// Return empty Cube API response
		response := CubeAPIResponse{
			Data: []map[string]interface{}{},
			Annotation: CubeAnnotation{
				Measures:       map[string]CubeFieldInfo{},
				Dimensions:     map[string]CubeFieldInfo{},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	query := `{
		"refId": "A"
	}`

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: []byte(query)},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
}

func TestQueryDataWithCubeQuery(t *testing.T) {
	// Create a mock server that returns expected test data
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Parse the query parameter
		query := r.URL.Query().Get("query")

		// Decode and validate it contains expected dimensions/measures
		var cubeQuery CubeQuery
		if err := json.Unmarshal([]byte(query), &cubeQuery); err != nil {
			t.Errorf("Failed to parse cube query: %v", err)
			http.Error(w, "Invalid query", http.StatusBadRequest)
			return
		}

		// Validate the expected query structure
		if len(cubeQuery.Measures) != 1 || cubeQuery.Measures[0] != "orders.count" {
			t.Errorf("Expected measures [orders.count], got %v", cubeQuery.Measures)
		}
		if len(cubeQuery.Dimensions) != 1 || cubeQuery.Dimensions[0] != "orders.users_age" {
			t.Errorf("Expected dimensions [orders.users_age], got %v", cubeQuery.Dimensions)
		}

		// Return mock Cube API response with test data
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{
					"orders.users_age": "26", // Cube returns strings that get converted
					"orders.count":     "514",
				},
			},
			Annotation: CubeAnnotation{
				Measures: map[string]CubeFieldInfo{
					"orders.count": {
						Title:      "Orders Count",
						ShortTitle: "Count",
						Type:       "number",
					},
				},
				Dimensions: map[string]CubeFieldInfo{
					"orders.users_age": {
						Title:      "Orders Users Age",
						ShortTitle: "Age",
						Type:       "number",
					},
				},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	query := map[string]interface{}{
		"refId":      "B",
		"measures":   []string{"orders.count"},
		"dimensions": []string{"orders.users_age"},
		"filters": []map[string]interface{}{
			{
				"values":   []string{"26"},
				"member":   "orders.users_age",
				"operator": "equals",
			},
		},
	}

	queryJSON, _ := json.Marshal(query)

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "B", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}

	frame := resp.Responses["B"].Frames[0]
	if len(frame.Fields) != 2 || frame.Fields[0].Name != "orders.users_age" || frame.Fields[1].Name != "orders.count" {
		t.Fatal("Expected 2 columns: orders.users_age and orders.count")
	}

	// Get the actual values - they should now be float64, not strings
	val0 := frame.Fields[0].At(0)
	val1 := frame.Fields[1].At(0)

	// Convert to float64 for comparison (convertToNumber now always returns float64)
	var actualAge, actualCount float64
	if age, ok := val0.(float64); ok {
		actualAge = age
	} else if agePtr, ok := val0.(*float64); ok && agePtr != nil {
		actualAge = *agePtr
	} else {
		t.Fatalf("Expected orders.users_age to be float64, got %T: %v", val0, val0)
	}

	if count, ok := val1.(float64); ok {
		actualCount = count
	} else if countPtr, ok := val1.(*float64); ok && countPtr != nil {
		actualCount = *countPtr
	} else {
		t.Fatalf("Expected orders.count to be float64, got %T: %v", val1, val1)
	}

	if actualAge != float64(26) || actualCount != float64(514) {
		t.Fatalf("Expected values: orders.users_age=26, orders.count=514, got: orders.users_age=%f, orders.count=%f", actualAge, actualCount)
	}
}

func TestQueryDataContinueWaitThenSuccess(t *testing.T) {
	// Cube returns {"error": "Continue wait"} (HTTP 200) when query results
	// aren't cached yet. The plugin must poll until data is ready.
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")

		if requestCount <= 2 {
			// First two requests: Cube is still computing
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Continue wait",
			})
			return
		}

		// Third request: data is ready
		_ = json.NewEncoder(w).Encode(CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.count": "42"},
			},
			Annotation: CubeAnnotation{
				Measures:       map[string]CubeFieldInfo{"orders.count": {Title: "Count", ShortTitle: "Count", Type: "number"}},
				Dimensions:     map[string]CubeFieldInfo{},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		})
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	queryJSON, _ := json.Marshal(map[string]interface{}{
		"refId":    "A",
		"measures": []string{"orders.count"},
	})

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	result := resp.Responses["A"]
	if result.Error != nil {
		t.Fatalf("Expected no error, got: %v", result.Error)
	}
	if len(result.Frames) != 1 {
		t.Fatalf("Expected 1 frame, got %d", len(result.Frames))
	}
	if result.Frames[0].Fields[0].Len() != 1 {
		t.Fatalf("Expected 1 row, got %d", result.Frames[0].Fields[0].Len())
	}
	if requestCount != 3 {
		t.Fatalf("Expected 3 requests (2 continue-wait + 1 success), got %d", requestCount)
	}
}

func TestQueryDataContinueWaitContextCancelled(t *testing.T) {
	// If the context is cancelled while polling, the plugin should return an error
	// rather than hanging forever.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Continue wait",
		})
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	queryJSON, _ := json.Marshal(map[string]interface{}{
		"refId":    "A",
		"measures": []string{"orders.count"},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	resp, err := ds.QueryData(
		ctx,
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	result := resp.Responses["A"]
	if result.Error == nil {
		t.Fatal("Expected an error when context is cancelled during continue-wait polling")
	}
}

func TestQueryDataHTTPTimeoutWrapped(t *testing.T) {
	// When an HTTP request to Cube times out (context deadline exceeded), the
	// error message should be wrapped with helpful context rather than showing
	// a raw Go error like "context deadline exceeded".
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow response that will exceed the context deadline
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(CubeAPIResponse{
			Data: []map[string]interface{}{{"orders.count": "5"}},
		})
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	queryJSON, _ := json.Marshal(map[string]interface{}{
		"refId":    "A",
		"measures": []string{"orders.count"},
	})

	// Context that expires before the server responds
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()

	resp, err := ds.QueryData(
		ctx,
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	result := resp.Responses["A"]
	if result.Error == nil {
		t.Fatal("Expected an error when HTTP request times out")
	}

	errMsg := result.Error.Error()
	if !strings.Contains(errMsg, "timed out") {
		t.Errorf("Expected timeout error to mention 'timed out', got: %s", errMsg)
	}
}

func TestQueryDataContinueWaitCancelledIncludesElapsedTime(t *testing.T) {
	// When the context is cancelled during "Continue wait" polling, the error
	// should include the timeElapsed from the last Cube response so users know
	// how long the upstream warehouse had been computing.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"error": "Continue wait", "stage": "Executing query", "timeElapsed": 25}`)
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	queryJSON, _ := json.Marshal(map[string]interface{}{
		"refId":    "A",
		"measures": []string{"orders.count"},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	resp, err := ds.QueryData(
		ctx,
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	result := resp.Responses["A"]
	if result.Error == nil {
		t.Fatal("Expected an error when context is cancelled during continue-wait polling")
	}

	errMsg := result.Error.Error()
	if !strings.Contains(errMsg, "25") {
		t.Errorf("Expected error to include timeElapsed (25), got: %s", errMsg)
	}
	if !strings.Contains(errMsg, "Executing query") {
		t.Errorf("Expected error to include stage ('Executing query'), got: %s", errMsg)
	}
}

func TestQueryDataWithMultipleDimensions(t *testing.T) {
	// Create a mock server that returns expected test data with multiple dimensions
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Parse the query parameter
		query := r.URL.Query().Get("query")

		// Decode and validate it contains expected dimensions/measures
		var cubeQuery CubeQuery
		if err := json.Unmarshal([]byte(query), &cubeQuery); err != nil {
			t.Errorf("Failed to parse cube query: %v", err)
			http.Error(w, "Invalid query", http.StatusBadRequest)
			return
		}

		// Validate the expected query structure
		if len(cubeQuery.Measures) != 1 || cubeQuery.Measures[0] != "orders.count" {
			t.Errorf("Expected measures [orders.count], got %v", cubeQuery.Measures)
		}
		expectedDimensions := []string{"orders.users_city", "orders.users_age"}
		if len(cubeQuery.Dimensions) != 2 ||
			cubeQuery.Dimensions[0] != expectedDimensions[0] ||
			cubeQuery.Dimensions[1] != expectedDimensions[1] {
			t.Errorf("Expected dimensions %v, got %v", expectedDimensions, cubeQuery.Dimensions)
		}

		// Return mock Cube API response with test data
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{
					"orders.users_city": "Reno",
					"orders.users_age":  "26",
					"orders.count":      "100",
				},
			},
			Annotation: CubeAnnotation{
				Measures: map[string]CubeFieldInfo{
					"orders.count": {
						Title:      "Orders Count",
						ShortTitle: "Count",
						Type:       "number",
					},
				},
				Dimensions: map[string]CubeFieldInfo{
					"orders.users_city": {
						Title:      "Orders Users City",
						ShortTitle: "City",
						Type:       "string",
					},
					"orders.users_age": {
						Title:      "Orders Users Age",
						ShortTitle: "Age",
						Type:       "number",
					},
				},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	query := map[string]interface{}{
		"refId":      "C",
		"measures":   []string{"orders.count"},
		"dimensions": []string{"orders.users_city", "orders.users_age"},
		"filters": []map[string]interface{}{
			{
				"values":   []string{"26"},
				"member":   "orders.users_age",
				"operator": "equals",
			},
			{
				"values":   []string{"Reno"},
				"member":   "orders.users_city",
				"operator": "equals",
			},
		},
		"order": map[string]interface{}{},
	}

	queryJSON, _ := json.Marshal(query)

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "C", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}

	frame := resp.Responses["C"].Frames[0]
	if len(frame.Fields) != 3 {
		t.Fatalf("Expected 3 columns, got %d", len(frame.Fields))
	}

	// Verify field ordering: dimensions first (city, age), then measures (count)
	if frame.Fields[0].Name != "orders.users_city" {
		t.Fatalf("Expected first field to be orders.users_city, got %s", frame.Fields[0].Name)
	}
	if frame.Fields[1].Name != "orders.users_age" {
		t.Fatalf("Expected second field to be orders.users_age, got %s", frame.Fields[1].Name)
	}
	if frame.Fields[2].Name != "orders.count" {
		t.Fatalf("Expected third field to be orders.count, got %s", frame.Fields[2].Name)
	}
}

func TestQueryDataWithAllNullColumn(t *testing.T) {
	// Test that columns with all null values are still included in the DataFrame
	// Table-driven test covers all Cube types: string, number, time, boolean

	testCases := []struct {
		name           string
		cubeType       string
		expectedGoType string
	}{
		{"string type", "string", "*string"},
		{"number type", "number", "*float64"},
		{"time type", "time", "*time.Time"},
		{"boolean type", "boolean", "*bool"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Return mock Cube API response where one dimension has all null values
				// When Cube returns all nulls for a column, the key is omitted from the data rows
				response := CubeAPIResponse{
					Data: []map[string]interface{}{
						{"orders.name": "Alice"},
						{"orders.name": "Bob"},
					},
					Annotation: CubeAnnotation{
						Measures: map[string]CubeFieldInfo{},
						Dimensions: map[string]CubeFieldInfo{
							"orders.name": {
								Title:      "Name",
								ShortTitle: "Name",
								Type:       "string",
							},
							"orders.null_field": {
								Title:      "Null Field",
								ShortTitle: "Null",
								Type:       tc.cubeType,
							},
						},
						Segments:       map[string]CubeFieldInfo{},
						TimeDimensions: map[string]CubeFieldInfo{},
					},
				}

				w.Header().Set("Content-Type", "application/json")
				if err := json.NewEncoder(w).Encode(response); err != nil {
					t.Errorf("Failed to encode response: %v", err)
				}
			}))
			defer server.Close()

			ds := Datasource{BaseURL: server.URL}

			query := map[string]interface{}{
				"refId":      "A",
				"dimensions": []string{"orders.name", "orders.null_field"},
			}

			queryJSON, _ := json.Marshal(query)

			resp, err := ds.QueryData(
				context.Background(),
				&backend.QueryDataRequest{
					PluginContext: newTestPluginContext(server.URL),
					Queries: []backend.DataQuery{
						{RefID: "A", JSON: queryJSON},
					},
				},
			)
			if err != nil {
				t.Fatal(err)
			}

			if len(resp.Responses) != 1 {
				t.Fatal("QueryData must return a response")
			}

			frame := resp.Responses["A"].Frames[0]

			// Null column should be included (not omitted)
			if len(frame.Fields) != 2 {
				t.Fatalf("Expected 2 columns (including null column), got %d", len(frame.Fields))
			}

			// Null column should have the correct type
			actualType := reflect.TypeOf(frame.Fields[1].At(0)).String()
			if actualType != tc.expectedGoType {
				t.Fatalf("Expected null column type %s, got %s", tc.expectedGoType, actualType)
			}
		})
	}
}

func TestQueryDataWithAllColumnsNull(t *testing.T) {
	// Test edge case: when ALL columns have all null values, the Cube API returns
	// empty objects like [{}, {}]. The frame should still have the correct row count.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return mock Cube API response where ALL columns have null values
		// When all values are null, Cube returns empty objects for each row
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{}, // Row 1: all nulls
				{}, // Row 2: all nulls
			},
			Annotation: CubeAnnotation{
				Measures: map[string]CubeFieldInfo{},
				Dimensions: map[string]CubeFieldInfo{
					"orders.name": {
						Title:      "Name",
						ShortTitle: "Name",
						Type:       "string",
					},
				},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}

	query := map[string]interface{}{
		"refId":      "A",
		"dimensions": []string{"orders.name"},
	}
	queryJSON, _ := json.Marshal(query)

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: newTestPluginContext(server.URL),
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	frame := resp.Responses["A"].Frames[0]
	if frame.Fields[0].Len() != 2 {
		t.Fatalf("Expected 2 rows (matching data rows), got %d", frame.Fields[0].Len())
	}
}

func TestCreateNullFieldWithTimeDimension(t *testing.T) {
	// When type info is in TimeDimensions (not Dimensions), createNullField
	// should still find it and create the correct field type.
	ds := Datasource{}
	annotation := CubeAnnotation{
		TimeDimensions: map[string]CubeFieldInfo{
			"orders.created_at": {Type: "time"},
		},
	}

	rowCount := 1 // arbitrary, not relevant to this test
	field := ds.createNullField("orders.created_at", rowCount, annotation)
	if reflect.TypeOf(field.At(0)).String() != "*time.Time" {
		t.Fatalf("Expected '*time.Time', got '%s'", reflect.TypeOf(field.At(0)).String())
	}
}

func TestQueryDataWithOrderField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query().Get("query")
		var cubeQuery CubeQuery
		if err := json.Unmarshal([]byte(query), &cubeQuery); err != nil {
			t.Errorf("Failed to parse cube query: %v", err)
			http.Error(w, "Invalid query", http.StatusBadRequest)
			return
		}

		if len(cubeQuery.Dimensions) != 1 || cubeQuery.Dimensions[0] != "orders.status" {
			t.Errorf("Expected dimensions [orders.status], got %v", cubeQuery.Dimensions)
		}
		if len(cubeQuery.Measures) != 1 || cubeQuery.Measures[0] != "orders.count" {
			t.Errorf("Expected measures [orders.count], got %v", cubeQuery.Measures)
		}

		orderMap, ok := cubeQuery.Order.(map[string]interface{})
		if !ok {
			t.Errorf("Expected order field as object, got %T", cubeQuery.Order)
			http.Error(w, "Invalid order", http.StatusBadRequest)
			return
		}
		if len(orderMap) != 2 {
			t.Errorf("Expected 2 order entries, got %v", orderMap)
			http.Error(w, "Invalid order", http.StatusBadRequest)
			return
		}
		if orderMap["orders.count"] != "desc" {
			t.Errorf("Expected orders.count sort direction desc, got %v", orderMap["orders.count"])
		}
		if orderMap["orders.status"] != "asc" {
			t.Errorf("Expected orders.status sort direction asc, got %v", orderMap["orders.status"])
		}

		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{"orders.status": "completed", "orders.count": "500"},
				{"orders.status": "pending", "orders.count": "300"},
				{"orders.status": "shipped", "orders.count": "200"},
			},
			Annotation: CubeAnnotation{
				Measures: map[string]CubeFieldInfo{
					"orders.count": {Type: "number"},
				},
				Dimensions: map[string]CubeFieldInfo{
					"orders.status": {Type: "string"},
				},
				Segments:       map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			t.Errorf("Failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	ds := Datasource{BaseURL: server.URL}
	queryJSON, _ := json.Marshal(map[string]interface{}{
		"refId":      "A",
		"dimensions": []string{"orders.status"},
		"measures":   []string{"orders.count"},
		"order": map[string]string{
			"orders.count":  "desc",
			"orders.status": "asc",
		},
	})

	resp, err := ds.QueryData(context.Background(), &backend.QueryDataRequest{
		PluginContext: newTestPluginContext(server.URL),
		Queries: []backend.DataQuery{{RefID: "A", JSON: queryJSON}},
	})
	if err != nil {
		t.Fatalf("QueryData failed: %v", err)
	}

	frame := resp.Responses["A"].Frames[0]
	if frame.Fields[0].Len() != 3 {
		t.Fatalf("Expected 3 rows, got %d", frame.Fields[0].Len())
	}
}

func TestQueryDataWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	// Test with empty URL
	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{}`),
				},
			},
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: []byte(`{"refId": "A"}`)},
			},
		},
	)
	// Should return error response, not a Go error
	if err != nil {
		t.Fatalf("Expected no Go error, got: %v", err)
	}

	// Check that we got an error response
	if len(resp.Responses) != 1 {
		t.Fatalf("Expected 1 response, got %d", len(resp.Responses))
	}

	response := resp.Responses["A"]
	if response.Error == nil {
		t.Fatalf("Expected error response, got none")
	}

	if !strings.Contains(response.Error.Error(), "Cube API URL is required") {
		t.Fatalf("Expected error about URL not configured, got: %s", response.Error.Error())
	}
}

func TestConvertToNumber(t *testing.T) {
	ds := &Datasource{}

	tests := []struct {
		name     string
		input    interface{}
		expected interface{}
	}{
		// Integer types - all should convert to float64
		{
			name:     "int to float64",
			input:    int(42),
			expected: float64(42),
		},
		{
			name:     "int8 to float64",
			input:    int8(127),
			expected: float64(127),
		},
		{
			name:     "int16 to float64",
			input:    int16(32767),
			expected: float64(32767),
		},
		{
			name:     "int32 to float64",
			input:    int32(2147483647),
			expected: float64(2147483647),
		},
		{
			name:     "int64 to float64",
			input:    int64(9223372036854775807),
			expected: float64(9223372036854775807),
		},
		{
			name:     "uint to float64",
			input:    uint(42),
			expected: float64(42),
		},
		{
			name:     "uint8 to float64",
			input:    uint8(255),
			expected: float64(255),
		},
		{
			name:     "uint16 to float64",
			input:    uint16(65535),
			expected: float64(65535),
		},
		{
			name:     "uint32 to float64",
			input:    uint32(4294967295),
			expected: float64(4294967295),
		},
		{
			name:     "uint64 to float64",
			input:    uint64(18446744073709551615),
			expected: float64(18446744073709551615),
		},
		// Float types
		{
			name:     "float32 to float64",
			input:    float32(3.14),
			expected: float64(float32(3.14)), // Preserve float32 precision loss
		},
		{
			name:     "float64 stays float64",
			input:    float64(3.141592653589793),
			expected: float64(3.141592653589793),
		},
		// String conversion
		{
			name:     "string integer to float64",
			input:    "42",
			expected: float64(42),
		},
		{
			name:     "string decimal to float64",
			input:    "3.14159",
			expected: float64(3.14159),
		},
		{
			name:     "string negative number to float64",
			input:    "-123.456",
			expected: float64(-123.456),
		},
		{
			name:     "string scientific notation to float64",
			input:    "1.23e10",
			expected: float64(1.23e10),
		},
		{
			name:     "invalid string stays string",
			input:    "not a number",
			expected: "not a number",
		},
		{
			name:     "empty string stays empty string",
			input:    "",
			expected: "",
		},
		// Other types should pass through unchanged
		{
			name:     "bool stays bool",
			input:    true,
			expected: true,
		},
		{
			name:     "nil stays nil",
			input:    nil,
			expected: nil,
		},
		{
			name:     "slice stays slice",
			input:    []int{1, 2, 3},
			expected: []int{1, 2, 3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ds.convertToNumber(tt.input)

			// Type assertion to check if result is float64 when expected
			if expectedFloat, ok := tt.expected.(float64); ok {
				resultFloat, ok := result.(float64)
				if !ok {
					t.Fatalf("Expected result to be float64, got %T", result)
				}
				if resultFloat != expectedFloat {
					t.Errorf("Expected %v, got %v", expectedFloat, resultFloat)
				}
			} else {
				// For non-comparable types (slices, maps), just verify the type matches
				if reflect.TypeOf(result) != reflect.TypeOf(tt.expected) {
					t.Errorf("Expected type %T, got type %T", tt.expected, result)
					return
				}
				// For comparable types, compare values directly
				switch tt.expected.(type) {
				case string, bool:
					if result != tt.expected {
						t.Errorf("Expected %v (%T), got %v (%T)", tt.expected, tt.expected, result, result)
					}
				}
			}
		})
	}
}

func TestConvertTimeField(t *testing.T) {
	ds := &Datasource{}

	tests := []struct {
		name          string
		inputValues   []interface{}
		expectedTimes []string // Expected RFC3339 format or empty for nil
		shouldConvert bool     // Whether conversion should happen
	}{
		{
			name:          "RFC3339 format",
			inputValues:   []interface{}{"2024-01-15T10:30:00Z", "2024-02-20T14:45:00Z"},
			expectedTimes: []string{"2024-01-15T10:30:00Z", "2024-02-20T14:45:00Z"},
			shouldConvert: true,
		},
		{
			name:          "ISO 8601 with milliseconds",
			inputValues:   []interface{}{"2024-01-15T10:30:00.123Z", "2024-02-20T14:45:00.456Z"},
			expectedTimes: []string{"2024-01-15T10:30:00Z", "2024-02-20T14:45:00Z"},
			shouldConvert: true,
		},
		{
			name:          "Date only format",
			inputValues:   []interface{}{"2024-01-15", "2024-02-20"},
			expectedTimes: []string{"2024-01-15T00:00:00Z", "2024-02-20T00:00:00Z"},
			shouldConvert: true,
		},
		{
			name:          "Mixed valid formats",
			inputValues:   []interface{}{"2024-01-15T10:30:00Z", "2024-02-20", "2024-03-25T08:15:00.789Z"},
			expectedTimes: []string{"2024-01-15T10:30:00Z", "2024-02-20T00:00:00Z", "2024-03-25T08:15:00Z"},
			shouldConvert: true,
		},
		{
			name:          "With nil values",
			inputValues:   []interface{}{"2024-01-15T10:30:00Z", nil, "2024-02-20T14:45:00Z"},
			expectedTimes: []string{"2024-01-15T10:30:00Z", "", "2024-02-20T14:45:00Z"},
			shouldConvert: true,
		},
		{
			name:          "Invalid time format stays nil",
			inputValues:   []interface{}{"not-a-date", "also-not-a-date"},
			expectedTimes: []string{"", ""},
			shouldConvert: true,
		},
		{
			name:          "Empty string stays nil",
			inputValues:   []interface{}{"", "2024-01-15T10:30:00Z"},
			expectedTimes: []string{"", "2024-01-15T10:30:00Z"},
			shouldConvert: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a string field with the input values
			stringValues := make([]*string, len(tt.inputValues))
			for i, v := range tt.inputValues {
				if v == nil {
					stringValues[i] = nil
				} else {
					str := v.(string)
					stringValues[i] = &str
				}
			}

			// Use data.NewField to create a nullable string field
			field := data.NewField("test_time", nil, stringValues)

			// Convert the field
			result := ds.convertTimeField(field)

			if !tt.shouldConvert {
				if result != nil {
					t.Errorf("Expected no conversion, but got converted field")
				}
				return
			}

			if result == nil {
				t.Fatalf("Expected converted field, got nil")
			}

			// Verify field name is preserved
			if result.Name != "test_time" {
				t.Errorf("Expected field name 'test_time', got '%s'", result.Name)
			}

			// Verify the converted values
			if result.Len() != len(tt.expectedTimes) {
				t.Fatalf("Expected %d values, got %d", len(tt.expectedTimes), result.Len())
			}

			for i, expected := range tt.expectedTimes {
				val := result.At(i)
				timeVal, ok := val.(*time.Time)
				if expected == "" {
					// Expect nil - either interface nil or typed nil pointer
					if ok && timeVal != nil {
						t.Errorf("Index %d: expected nil time, got %v", i, val)
					}
				} else {
					// Expect time value
					if !ok {
						t.Errorf("Index %d: expected *time.Time, got %T", i, val)
						continue
					}
					if timeVal == nil {
						t.Errorf("Index %d: expected non-nil time, got nil pointer", i)
						continue
					}
					// Compare formatted times (ignoring sub-second precision)
					actualFormatted := timeVal.UTC().Format(time.RFC3339)
					if actualFormatted != expected {
						t.Errorf("Index %d: expected %s, got %s", i, expected, actualFormatted)
					}
				}
			}
		})
	}
}

func TestConvertTimeFieldNonStringField(t *testing.T) {
	ds := &Datasource{}

	// Test that non-string fields return nil (no conversion needed)
	intValues := []int64{1, 2, 3}
	intField := data.NewField("test_int", nil, intValues)

	result := ds.convertTimeField(intField)
	if result != nil {
		t.Errorf("Expected nil for non-string field, got converted field")
	}

	// Test float field
	floatValues := []float64{1.1, 2.2, 3.3}
	floatField := data.NewField("test_float", nil, floatValues)

	result = ds.convertTimeField(floatField)
	if result != nil {
		t.Errorf("Expected nil for float field, got converted field")
	}

	// Test time field (already time type)
	now := time.Now()
	timeValues := []*time.Time{&now, nil}
	timeField := data.NewField("test_time", nil, timeValues)

	result = ds.convertTimeField(timeField)
	if result != nil {
		t.Errorf("Expected nil for already-time field, got converted field")
	}
}

func TestConvertTimeDimensions(t *testing.T) {
	ds := &Datasource{}

	// Create frame with a time dimension field (as string) and a regular dimension
	timeStr1 := "2024-01-15T10:30:00Z"
	timeStr2 := "2024-02-20T14:45:00Z"
	statusStr1 := "completed"
	statusStr2 := "pending"

	frame := data.NewFrame("test",
		data.NewField("orders.created_at", nil, []*string{&timeStr1, &timeStr2}),
		data.NewField("orders.status", nil, []*string{&statusStr1, &statusStr2}),
	)

	annotation := CubeAnnotation{
		TimeDimensions: map[string]CubeFieldInfo{
			"orders.created_at": {Title: "Created At", Type: "time"},
		},
		Dimensions: map[string]CubeFieldInfo{
			"orders.status": {Title: "Status", Type: "string"},
		},
		Measures: map[string]CubeFieldInfo{},
		Segments: map[string]CubeFieldInfo{},
	}

	// Run conversion
	ds.convertTimeDimensions(frame, annotation)

	// Verify time field was converted
	timeField := frame.Fields[0]
	if timeField.Type() != data.FieldTypeNullableTime {
		t.Errorf("Expected time field to be NullableTime, got %s", timeField.Type())
	}

	// Verify non-time field was NOT converted
	statusField := frame.Fields[1]
	if statusField.Type() != data.FieldTypeNullableString {
		t.Errorf("Expected status field to remain NullableString, got %s", statusField.Type())
	}

	// Verify time values are correct
	val := timeField.At(0)
	if timeVal, ok := val.(*time.Time); ok && timeVal != nil {
		expected := "2024-01-15T10:30:00Z"
		actual := timeVal.UTC().Format(time.RFC3339)
		if actual != expected {
			t.Errorf("Expected time %s, got %s", expected, actual)
		}
	} else {
		t.Errorf("Expected *time.Time value, got %T", val)
	}
}

func TestConvertTimeDimensionsRegularDimensionWithTimeType(t *testing.T) {
	ds := &Datasource{}

	// Test case: a date field used as a regular dimension (not in timeDimensions)
	// This happens when you query a date field without granularity
	dateStr1 := "2018-01-01T00:00:00.000"
	dateStr2 := "2018-01-02T00:00:00.000"

	frame := data.NewFrame("test",
		data.NewField("orders.order_date", nil, []*string{&dateStr1, &dateStr2}),
	)

	// The field appears in Dimensions (not TimeDimensions) but has type "time"
	annotation := CubeAnnotation{
		TimeDimensions: map[string]CubeFieldInfo{}, // Empty - not a time dimension query
		Dimensions: map[string]CubeFieldInfo{
			"orders.order_date": {Title: "Order Date", Type: "time"},
		},
		Measures: map[string]CubeFieldInfo{},
		Segments: map[string]CubeFieldInfo{},
	}

	// Run conversion
	ds.convertTimeDimensions(frame, annotation)

	// Verify the field was converted to time type
	dateField := frame.Fields[0]
	if dateField.Type() != data.FieldTypeNullableTime {
		t.Errorf("Expected date dimension to be NullableTime, got %s", dateField.Type())
	}

	// Verify time value is correct
	val := dateField.At(0)
	if timeVal, ok := val.(*time.Time); ok && timeVal != nil {
		expected := "2018-01-01T00:00:00Z"
		actual := timeVal.UTC().Format(time.RFC3339)
		if actual != expected {
			t.Errorf("Expected time %s, got %s", expected, actual)
		}
	} else {
		t.Errorf("Expected *time.Time value, got %T", val)
	}
}

func TestConvertTimeDimensionsIntegration(t *testing.T) {
	// Create a mock server that returns data with time dimensions
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return mock Cube API response with time dimension
		response := CubeAPIResponse{
			Data: []map[string]interface{}{
				{
					"orders.created_at": "2024-01-15T10:30:00.000Z",
					"orders.count":      "100",
				},
				{
					"orders.created_at": "2024-01-16T11:45:00.000Z",
					"orders.count":      "150",
				},
			},
			Annotation: CubeAnnotation{
				Measures: map[string]CubeFieldInfo{
					"orders.count": {
						Title:      "Orders Count",
						ShortTitle: "Count",
						Type:       "number",
					},
				},
				Dimensions: map[string]CubeFieldInfo{},
				Segments:   map[string]CubeFieldInfo{},
				TimeDimensions: map[string]CubeFieldInfo{
					"orders.created_at": {
						Title:      "Created At",
						ShortTitle: "Created",
						Type:       "time",
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

	ds := Datasource{BaseURL: server.URL}

	query := map[string]interface{}{
		"refId":      "A",
		"measures":   []string{"orders.count"},
		"dimensions": []string{"orders.created_at"},
	}
	queryJSON, _ := json.Marshal(query)

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					URL:      server.URL,
					JSONData: []byte(`{"deploymentType": "self-hosted-dev"}`),
				},
			},
			Queries: []backend.DataQuery{
				{RefID: "A", JSON: queryJSON},
			},
		},
	)
	if err != nil {
		t.Fatalf("QueryData failed: %v", err)
	}

	if len(resp.Responses) != 1 {
		t.Fatalf("Expected 1 response, got %d", len(resp.Responses))
	}

	response := resp.Responses["A"]
	if response.Error != nil {
		t.Fatalf("Response had error: %v", response.Error)
	}

	if len(response.Frames) != 1 {
		t.Fatalf("Expected 1 frame, got %d", len(response.Frames))
	}

	frame := response.Frames[0]

	// Find the time field and verify it was converted
	var timeField *data.Field
	for _, field := range frame.Fields {
		if field.Name == "orders.created_at" {
			timeField = field
			break
		}
	}

	if timeField == nil {
		t.Fatal("Time field 'orders.created_at' not found in response")
	}

	// Verify time field is now time type (not string)
	if timeField.Type() != data.FieldTypeNullableTime {
		t.Errorf("Expected time field to be NullableTime type, got %s", timeField.Type())
	}

	// Verify time values are parsed correctly
	val := timeField.At(0)
	if timeVal, ok := val.(*time.Time); ok && timeVal != nil {
		expected := "2024-01-15T10:30:00Z"
		actual := timeVal.UTC().Format(time.RFC3339)
		if actual != expected {
			t.Errorf("Expected first time value %s, got %s", expected, actual)
		}
	} else {
		t.Errorf("Expected *time.Time value at index 0, got %T", val)
	}
}
