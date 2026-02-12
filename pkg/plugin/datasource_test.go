package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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

	// The error should mention "timed out" — not just raw "context deadline exceeded"
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
	// Should mention the elapsed time from Cube's response
	if !strings.Contains(errMsg, "25") {
		t.Errorf("Expected error to include timeElapsed (25), got: %s", errMsg)
	}
	// Should mention the stage
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
					PluginContext: backend.PluginContext{
						DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
							JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
						},
					},
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
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				},
			},
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
			http.Error(w, "Invalid order field type", http.StatusBadRequest)
			return
		}
		if len(orderMap) != 2 {
			t.Errorf("Expected 2 order entries, got %v", orderMap)
			http.Error(w, "Invalid order entry count", http.StatusBadRequest)
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl":"` + server.URL + `","deploymentType":"self-hosted-dev"}`),
			},
		},
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
					"SELECT\n  \"raw_customers\".city \"orders__users_city\",\n  count(*) \"orders__count\"\nFROM\n  raw_orders AS \"raw_orders\"\n  LEFT JOIN raw_customers AS \"raw_customers\" ON \"raw_orders\".user_id = raw_customers.id\nGROUP BY\n  1\nORDER BY\n  2 DESC\nLIMIT\n  10000",
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=" + `{"measures":["orders.count"],"dimensions":["orders.users_city"]}`,
	}

	// Create a response sender to capture the response
	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Call the handler
	err := ds.handleSQLCompilation(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a successful response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", capturedResponse.Status, string(capturedResponse.Body))
	}

	// Parse the response and verify it contains the SQL
	var sqlResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &sqlResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	expectedSQL := "SELECT\n  \"raw_customers\".city \"orders__users_city\",\n  count(*) \"orders__count\"\nFROM\n  raw_orders AS \"raw_orders\"\n  LEFT JOIN raw_customers AS \"raw_customers\" ON \"raw_orders\".user_id = raw_customers.id\nGROUP BY\n  1\nORDER BY\n  2 DESC\nLIMIT\n  10000"
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=invalid-json",
	}

	// Create a response sender to capture the response
	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Call the handler
	err := ds.handleSQLCompilation(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 400 error for invalid JSON
	if capturedResponse.Status != 400 {
		t.Fatalf("Expected status 400, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "invalid query JSON" {
		t.Fatalf("Expected error 'invalid query JSON', got '%s'", errorResponse["error"])
	}
}

func TestHandleSQLCompilationMissingQuery(t *testing.T) {
	ds := Datasource{}

	// Create a mock request without query parameter
	req := &backend.CallResourceRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "http://localhost:4000", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "sql",
		Method: "GET",
		URL:    "/sql",
	}

	// Create a response sender to capture the response
	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Call the handler
	err := ds.handleSQLCompilation(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 400 error for missing query
	if capturedResponse.Status != 400 {
		t.Fatalf("Expected status 400, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if errorResponse["error"] != "query parameter is required" {
		t.Fatalf("Expected error 'query parameter is required', got '%s'", errorResponse["error"])
	}
}

func TestExtractMetadataFromResponse(t *testing.T) {
	// Test the metadata extraction logic separately
	ds := &Datasource{}

	metaResponse := &CubeMetaResponse{
		Cubes: []CubeMeta{
			{
				Name:  "orders",
				Title: "Orders View",
				Type:  "view",
				Dimensions: []CubeDimension{
					{
						Name:       "orders.status",
						Title:      "Order Status",
						ShortTitle: "Status",
						Type:       "string",
					},
					{
						Name:       "orders.customer",
						Title:      "Customer Name",
						ShortTitle: "Customer",
						Type:       "string",
					},
				},
				Measures: []CubeMeasure{
					{
						Name:       "orders.count",
						Title:      "Orders Count",
						ShortTitle: "Count",
						Type:       "number",
					},
					{
						Name:       "orders.total",
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
		{"orders.status", "orders.status", "string"},
		{"orders.customer", "orders.customer", "string"},
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
		{"orders.count", "orders.count", "number"},
		{"orders.total", "orders.total", "number"},
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
					Name:  "raw_orders",
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
							Name:       "user_id",
							Title:      "Raw User ID",
							ShortTitle: "Raw User ID",
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
					Name:  "raw_customers",
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
					Name:  "orders",
					Title: "Orders View",
					Type:  "view",
					Dimensions: []CubeDimension{
						{
							Name:       "orders.status",
							Title:      "Order Status",
							ShortTitle: "Status",
							Type:       "string",
						},
						{
							Name:       "orders.customers_first_name",
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	// Create a response sender to capture the response
	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Call the handler
	err := ds.handleMetadata(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a successful response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", capturedResponse.Status, string(capturedResponse.Body))
	}

	// Parse the response and verify it contains the expected metadata
	var metadata MetadataResponse
	if err := json.Unmarshal(capturedResponse.Body, &metadata); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Also verify that the raw JSON contains the Type field by parsing as generic JSON
	var genericResponse map[string]interface{}
	if err := json.Unmarshal(capturedResponse.Body, &genericResponse); err != nil {
		t.Fatalf("Failed to parse response as generic JSON: %v", err)
	}

	// We should have 2 dimensions from the view (not the raw cubes): orders.status, orders.customers_first_name
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
		"orders.status":               {"orders.status", "string"},
		"orders.customers_first_name": {"orders.customers_first_name", "string"},
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

func TestBuildAPIURL(t *testing.T) {
	tests := []struct {
		name            string
		cubeApiUrl      string
		baseURLOverride string
		endpoint        string
		expectError     bool
		expectedURL     string
		errorContains   string
	}{
		// Valid URL cases
		{
			name:        "valid HTTP URL",
			cubeApiUrl:  "http://localhost:4000",
			endpoint:    "load",
			expectError: false,
			expectedURL: "http://localhost:4000/cubejs-api/v1/load",
		},
		{
			name:        "valid HTTPS URL",
			cubeApiUrl:  "https://my-cube-api.com",
			endpoint:    "meta",
			expectError: false,
			expectedURL: "https://my-cube-api.com/cubejs-api/v1/meta",
		},
		{
			name:        "valid URL with port",
			cubeApiUrl:  "https://api.example.com:8080",
			endpoint:    "sql",
			expectError: false,
			expectedURL: "https://api.example.com:8080/cubejs-api/v1/sql",
		},
		{
			name:        "valid URL with trailing slash",
			cubeApiUrl:  "http://localhost:4000/",
			endpoint:    "load",
			expectError: false,
			expectedURL: "http://localhost:4000/cubejs-api/v1/load", // Trailing slash is properly handled
		},
		{
			name:        "valid URL with existing path",
			cubeApiUrl:  "http://example.com/cube",
			endpoint:    "meta",
			expectError: false,
			expectedURL: "http://example.com/cube/cubejs-api/v1/meta",
		},
		{
			name:            "test override functionality",
			cubeApiUrl:      "http://localhost:4000",
			baseURLOverride: "http://test-server:3000",
			endpoint:        "sql",
			expectError:     false,
			expectedURL:     "http://test-server:3000/cubejs-api/v1/sql",
		},
		// Invalid URL cases
		{
			name:          "empty URL",
			cubeApiUrl:    "",
			endpoint:      "load",
			expectError:   true,
			errorContains: "Cube API URL is required",
		},
		{
			name:          "whitespace only URL",
			cubeApiUrl:    "   ",
			endpoint:      "load",
			expectError:   true,
			errorContains: "Cube API URL is required",
		},
		{
			name:          "invalid URL - no protocol",
			cubeApiUrl:    "not-a-url",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - missing scheme",
			cubeApiUrl:    "://invalid",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - incomplete",
			cubeApiUrl:    "http://",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - missing protocol scheme",
			cubeApiUrl:    "localhost:4000",
			endpoint:      "load",
			expectError:   true,
			errorContains: "missing protocol scheme",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create datasource instance
			ds := &Datasource{}
			if tt.baseURLOverride != "" {
				ds.BaseURL = tt.baseURLOverride
			}

			// Create mock plugin context
			pluginContext := backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": "` + tt.cubeApiUrl + `"}`),
				},
			}

			// Call buildAPIURL
			apiReq, err := ds.buildAPIURL(pluginContext, tt.endpoint)

			// Check error expectation
			if tt.expectError {
				if err == nil {
					t.Fatalf("Expected error but got none")
				}
				if tt.errorContains != "" && !containsString(err.Error(), tt.errorContains) {
					t.Fatalf("Expected error to contain '%s', got '%s'", tt.errorContains, err.Error())
				}
				return
			}

			// Check success case
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if apiReq.URL.String() != tt.expectedURL {
				t.Fatalf("Expected URL '%s', got '%s'", tt.expectedURL, apiReq.URL.String())
			}

			// Verify config is returned
			if apiReq.Config == nil {
				t.Fatalf("Expected config to be returned, got nil")
			}

			// Verify config contains the expected URL (unless overridden)
			expectedConfigURL := tt.cubeApiUrl
			if tt.baseURLOverride != "" {
				// When overridden, config should still contain original URL
				expectedConfigURL = tt.cubeApiUrl
			}
			if apiReq.Config.CubeApiUrl != expectedConfigURL {
				t.Fatalf("Expected config.CubeApiUrl '%s', got '%s'", expectedConfigURL, apiReq.Config.CubeApiUrl)
			}
		})
	}
}

// Helper function to check if a string contains a substring
func containsString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestQueryDataWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	// Test with empty URL
	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			PluginContext: backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					JSONData: []byte(`{"cubeApiUrl": ""}`),
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

	if !containsString(response.Error.Error(), "Cube API URL is required") {
		t.Fatalf("Expected error about URL not configured, got: %s", response.Error.Error())
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	// Create a response sender to capture the response
	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Call the handler
	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a successful response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", capturedResponse.Status, string(capturedResponse.Body))
	}

	// Parse the response and verify it contains the expected tag values
	var tagValues []TagValue
	if err := json.Unmarshal(capturedResponse.Body, &tagValues); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	var tagValues []TagValue
	if err := json.Unmarshal(capturedResponse.Body, &tagValues); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should only have 2 unique values, not 4
	if len(tagValues) != 2 {
		t.Fatalf("Expected 2 unique tag values, got %d", len(tagValues))
	}
}

func TestHandleTagValuesMissingKey(t *testing.T) {
	ds := Datasource{}

	// Request without key parameter
	req := &backend.CallResourceRequest{
		Path:   "tag-values",
		Method: "GET",
		URL:    "/tag-values", // No key parameter
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "http://example.com", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Should return 400 for missing key
	if capturedResponse.Status != 400 {
		t.Fatalf("Expected status 400, got %d. Response: %s", capturedResponse.Status, string(capturedResponse.Body))
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	var tagValues []TagValue
	if err := json.Unmarshal(capturedResponse.Body, &tagValues); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Response: %s", capturedResponse.Status, string(capturedResponse.Body))
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Critical: verify the response is "[]" not "null"
	// This ensures Grafana AdHoc filter dropdown receives an empty array, not null
	responseBody := string(capturedResponse.Body)
	if responseBody != "[]" {
		t.Errorf("Expected empty array '[]', got '%s'", responseBody)
	}

	// Also verify it parses as an empty slice
	var tagValues []TagValue
	if err := json.Unmarshal(capturedResponse.Body, &tagValues); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d. Body: %s", capturedResponse.Status, string(capturedResponse.Body))
	}

	// Verify we actually polled (3 requests total)
	if requestCount != 3 {
		t.Errorf("Expected 3 requests (2 continue-wait + 1 success), got %d", requestCount)
	}

	// Verify correct tag values were returned
	var tagValues []TagValue
	if err := json.Unmarshal(capturedResponse.Body, &tagValues); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Create a context that cancels after a short time
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := ds.handleTagValues(ctx, req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// The response should be an error because we cancelled while waiting
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500 (context cancelled), got %d. Body: %s", capturedResponse.Status, string(capturedResponse.Body))
	}

	// The context expired via WithTimeout (deadline), so the message should say "timed out"
	responseBody := string(capturedResponse.Body)
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleTagValues(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	if capturedResponse.Status != http.StatusTooManyRequests {
		t.Fatalf("Expected status %d, got %d. Body: %s", http.StatusTooManyRequests, capturedResponse.Status, string(capturedResponse.Body))
	}
	if strings.TrimSpace(string(capturedResponse.Body)) != expectedBody {
		t.Fatalf("Expected body %s, got %s", expectedBody, string(capturedResponse.Body))
	}
}

func TestFetchCubeMetadataWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	pluginContext := backend.PluginContext{
		DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
			JSONData: []byte(`{"cubeApiUrl": ""}`),
		},
	}

	_, err := ds.fetchCubeMetadata(context.Background(), pluginContext)

	if err == nil {
		t.Fatalf("Expected error, got none")
	}

	if !containsString(err.Error(), "Cube API URL is required") {
		t.Fatalf("Expected error about URL not configured, got: %s", err.Error())
	}
}

func TestHandleSQLCompilationWithInvalidURL(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CallResourceRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": ""}`),
			},
		},
		Path:   "sql",
		Method: "GET",
		URL:    "/sql?query=" + `{"measures":["orders.count"]}`,
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleSQLCompilation(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 error response (server configuration issue)
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
		t.Fatalf("Failed to parse error response: %v", err)
	}

	if !containsString(errorResponse["error"], "Cube API URL is required") {
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
					FileName: "raw_customers.yml",
					Content: `cubes:
  - name: raw_customers
    sql_table: raw_customers
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true`,
				},
				{
					FileName: "raw_orders.yml",
					Content: `cubes:
  - name: raw_orders
    sql_table: raw_orders
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "model-files",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleModelFiles(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 200 response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Parse and verify the response
	var modelFilesResponse ModelFilesResponse
	if err := json.Unmarshal(capturedResponse.Body, &modelFilesResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify we got the expected files
	if len(modelFilesResponse.Files) != 2 {
		t.Fatalf("Expected 2 files, got %d", len(modelFilesResponse.Files))
	}

	// Verify file names
	expectedFiles := []string{"raw_customers.yml", "raw_orders.yml"}
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
					"raw_customers": []map[string]interface{}{
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
					"raw_orders": []map[string]interface{}{
						{
							"name":       "id",
							"type":       "integer",
							"attributes": []string{},
						},
						{
							"name":       "user_id",
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleDbSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 200 response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Parse and verify the response
	var dbSchemaResponse DbSchemaResponse
	if err := json.Unmarshal(capturedResponse.Body, &dbSchemaResponse); err != nil {
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

	expectedTables := []string{"raw_customers", "raw_orders"}
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleDbSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 response
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleDbSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 response
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
				JSONData: []byte(`{}`), // No cubeApiUrl configured
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleDbSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 response
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "db-schema",
		Method: "GET",
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Test that CallResource correctly routes to handleDbSchema
	err := ds.CallResource(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("CallResource returned error: %v", err)
	}

	// Verify we got a 200 response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Verify the response contains expected schema data
	var dbSchemaResponse DbSchemaResponse
	if err := json.Unmarshal(capturedResponse.Body, &dbSchemaResponse); err != nil {
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
					FileName: "raw_customers.yml",
					Content: `cubes:
  - name: raw_customers
    sql_table: public.raw_customers
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
		Tables: [][]string{{"public", "raw_customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"raw_customers": []map[string]interface{}{
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err = ds.handleGenerateSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 200 response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Parse and verify the response
	var generateSchemaResponse GenerateSchemaResponse
	if err := json.Unmarshal(capturedResponse.Body, &generateSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify we got the expected schema files
	if len(generateSchemaResponse.Files) != 1 {
		t.Fatalf("Expected 1 file, got %d", len(generateSchemaResponse.Files))
	}

	file := generateSchemaResponse.Files[0]
	if file.FileName != "raw_customers.yml" {
		t.Errorf("Expected fileName raw_customers.yml, got %s", file.FileName)
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

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleGenerateSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 405 response
	if capturedResponse.Status != 405 {
		t.Fatalf("Expected status 405, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err := ds.handleGenerateSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 400 response
	if capturedResponse.Status != 400 {
		t.Fatalf("Expected status 400, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
		Tables: [][]string{{"public", "raw_customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"raw_customers": []map[string]interface{}{
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err = ds.handleGenerateSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 response
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
		Tables: [][]string{{"public", "raw_customers"}},
		TablesSchema: map[string]interface{}{
			"public": map[string]interface{}{
				"raw_customers": []map[string]interface{}{
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	err = ds.handleGenerateSchema(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Verify we got a 500 response
	if capturedResponse.Status != 500 {
		t.Fatalf("Expected status 500, got %d", capturedResponse.Status)
	}

	// Verify error message
	var errorResponse map[string]string
	if err := json.Unmarshal(capturedResponse.Body, &errorResponse); err != nil {
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
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
			},
		},
		Path:   "generate-schema",
		Method: "POST",
		Body:   requestBodyBytes,
	}

	var capturedResponse *backend.CallResourceResponse
	sender := backend.CallResourceResponseSenderFunc(func(res *backend.CallResourceResponse) error {
		capturedResponse = res
		return nil
	})

	// Test that CallResource correctly routes to handleGenerateSchema
	err = ds.CallResource(context.Background(), req, sender)
	if err != nil {
		t.Fatalf("CallResource returned error: %v", err)
	}

	// Verify we got a 200 response
	if capturedResponse.Status != 200 {
		t.Fatalf("Expected status 200, got %d", capturedResponse.Status)
	}

	// Verify the response contains expected schema data
	var generateSchemaResponse GenerateSchemaResponse
	if err := json.Unmarshal(capturedResponse.Body, &generateSchemaResponse); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if len(generateSchemaResponse.Files) == 0 {
		t.Errorf("Expected files to be present")
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
				case string, bool, nil:
					if result != tt.expected {
						t.Errorf("Expected %v (%T), got %v (%T)", tt.expected, tt.expected, result, result)
					}
				}
			}
		})
	}
}

func TestGenerateJWT(t *testing.T) {
	ds := &Datasource{}
	secret := "test-secret-key"

	tokenString, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}

	if tokenString == "" {
		t.Fatal("Expected non-empty token string")
	}

	// Parse and verify the token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("Failed to parse token: %v", err)
	}

	if !token.Valid {
		t.Fatal("Token is not valid")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("Failed to extract claims")
	}

	// Verify sub claim
	if sub, ok := claims["sub"].(string); !ok || sub != "grafana-cube-datasource" {
		t.Errorf("Expected sub claim to be 'grafana-cube-datasource', got %v", claims["sub"])
	}

	// Verify exp claim exists and is in the future
	if exp, ok := claims["exp"].(float64); ok {
		expTime := time.Unix(int64(exp), 0)
		if expTime.Before(time.Now()) {
			t.Errorf("Token expiration is in the past: %v", expTime)
		}
		// Verify expiration is approximately 1 hour from now (allow 5 minute tolerance)
		expectedExp := time.Now().Add(time.Hour)
		diff := expTime.Sub(expectedExp)
		if diff < -5*time.Minute || diff > 5*time.Minute {
			t.Errorf("Token expiration is not approximately 1 hour from now. Expected ~%v, got %v", expectedExp, expTime)
		}
	} else {
		t.Error("exp claim is missing or invalid")
	}

	// Verify iat claim exists
	if _, ok := claims["iat"].(float64); !ok {
		t.Error("iat claim is missing or invalid")
	}
}

func TestGenerateJWTCaching(t *testing.T) {
	ds := &Datasource{}
	secret := "test-secret-key"

	// First call should generate a new token
	token1, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}
	if token1 == "" {
		t.Fatal("Expected non-empty token string")
	}

	// Second call with same secret should return cached token
	token2, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}
	if token1 != token2 {
		t.Errorf("Expected cached token to be returned, but got different token. Token1: %s, Token2: %s", token1, token2)
	}

	// Different secret should generate different token
	secret2 := "different-secret-key"
	token3, err := ds.generateJWT(secret2)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}
	if token3 == token1 {
		t.Error("Expected different token for different secret")
	}

	// Same secret should still return cached token
	token4, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}
	if token4 != token1 {
		t.Error("Expected cached token to still be returned")
	}
}

func TestGenerateJWTCacheExpiration(t *testing.T) {
	ds := &Datasource{}
	secret := "test-secret-key"

	// Generate first token
	token1, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}

	// Small delay to ensure different iat claim
	time.Sleep(2 * time.Second)

	// Manually expire the cache by setting expiration to past
	ds.jwtCacheMutex.Lock()
	if ds.jwtCache == nil {
		ds.jwtCache = make(map[string]jwtCacheEntry)
	}
	// Set expiration to past to simulate expired cache
	expiredTime := time.Now().Add(-1 * time.Minute)
	ds.jwtCache[secret] = jwtCacheEntry{
		token:      token1,
		expiration: expiredTime,
	}
	ds.jwtCacheMutex.Unlock()

	// Verify the cache entry is expired
	if !time.Now().After(expiredTime) {
		t.Fatal("Test setup failed: expiration time should be in the past")
	}

	// Next call should generate a new token since cache expired
	token2, err := ds.generateJWT(secret)
	if err != nil {
		t.Fatalf("generateJWT failed: %v", err)
	}
	if token1 == token2 {
		t.Error("Expected new token after cache expiration, but got same token")
	}

	// Verify the new token is cached with a future expiration
	ds.jwtCacheMutex.RLock()
	cached, exists := ds.jwtCache[secret]
	ds.jwtCacheMutex.RUnlock()
	if !exists {
		t.Fatal("Expected token to be cached after generation")
	}
	if cached.token != token2 {
		t.Error("Expected cached token to match newly generated token")
	}
	if !time.Now().Before(cached.expiration) {
		t.Error("Expected cached token expiration to be in the future")
	}
}

func TestGenerateJWTConcurrentAccess(t *testing.T) {
	ds := &Datasource{}
	secret := "test-secret-key"

	// Test concurrent access to ensure thread safety
	const numGoroutines = 10
	results := make(chan string, numGoroutines)
	errors := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func() {
			token, err := ds.generateJWT(secret)
			results <- token
			errors <- err
		}()
	}

	// Collect all results
	var tokens []string
	for i := 0; i < numGoroutines; i++ {
		if err := <-errors; err != nil {
			t.Fatalf("generateJWT failed: %v", err)
		}
		token := <-results
		if token == "" {
			t.Fatal("Expected non-empty token string")
		}
		tokens = append(tokens, token)
	}

	// All tokens should be the same (cached)
	firstToken := tokens[0]
	for i, token := range tokens {
		if token != firstToken {
			t.Errorf("Token %d differs from first token. Expected all tokens to be cached and identical", i)
		}
	}
}

func TestGenerateJWTConcurrentExpiredCache(t *testing.T) {
	// This test was used to verify that double-checked locking prevents multiple token
	// generations when cache expires. Without double-checked locking, multiple goroutines
	// can all see expired cache, release read lock, and generate tokens concurrently.
	//
	// The test was deterministic with instrumentation (commit 4f6dbec) where it failed
	// locally showing multiple token generations (4 generations instead of 1). However,
	// the same commit passed in CI (GitHub Actions run 19706535117), demonstrating the
	// non-deterministic nature of race condition tests - they depend on timing, CPU scheduling,
	// and system load.
	//
	// Without instrumentation, the test is non-deterministic and unreliable - token generation
	// is fast enough that even without double-checked locking, the test often passes.
	// Since the double-checked locking fix is correct and addresses the race condition
	// identified in code review, this test doesn't add value in normal usage.
	//
	// See commit 4f6dbec for the version that demonstrated the race condition locally.
	// CI run: https://github.com/grafana/grafana-cube-datasource/actions/runs/19706535117
	t.Skip("Skipped: Test is non-deterministic without instrumentation. The double-checked " +
		"locking fix is correct and verified. See commit 4f6dbec for the instrumentation version " +
		"that failed locally but passed in CI, demonstrating the non-deterministic nature.")
}

func TestCheckHealth(t *testing.T) {
	tests := []struct {
		name           string
		jsonData       string
		secureJsonData map[string]string
		mockServer     bool
		mockResponse   int
		expectedStatus backend.HealthStatus
		expectedMsg    string
	}{
		{
			name:           "missing cube API URL",
			jsonData:       `{"deploymentType": "cloud"}`,
			secureJsonData: map[string]string{"apiKey": "test-key"},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Cube API URL is required",
		},
		{
			name:           "missing deployment type",
			jsonData:       `{"cubeApiUrl": "http://localhost:4000"}`,
			secureJsonData: map[string]string{"apiKey": "test-key"},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "deployment type is required",
		},
		{
			name:           "cloud deployment without API key",
			jsonData:       `{"cubeApiUrl": "http://localhost:4000", "deploymentType": "cloud"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "API key is required for Cube Cloud deployments",
		},
		{
			name:           "self-hosted deployment without API secret",
			jsonData:       `{"cubeApiUrl": "http://localhost:4000", "deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "API secret is required for self-hosted Cube deployments",
		},
		{
			name:           "unknown deployment type",
			jsonData:       `{"cubeApiUrl": "http://localhost:4000", "deploymentType": "unknown"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "unknown deployment type",
		},
		{
			name:           "invalid cube API URL",
			jsonData:       `{"cubeApiUrl": "://invalid-url", "deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "invalid Cube API URL format",
		},
		{
			name:           "URL without protocol scheme should fail",
			jsonData:       `{"cubeApiUrl": "localhost:4000", "deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "missing protocol scheme",
		},
		{
			name:           "self-hosted-dev successful connection",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "Successfully connected to Cube API",
		},
		{
			name:           "cloud successful connection with auth verification",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "cloud"}`,
			secureJsonData: map[string]string{"apiKey": "test-api-key"},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "Successfully connected to Cube API and verified authentication",
		},
		{
			name:           "self-hosted successful connection with auth verification",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{"apiSecret": "test-api-secret"},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "Successfully connected to Cube API and verified authentication",
		},
		{
			name:           "authentication failure - unauthorized",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "cloud"}`,
			secureJsonData: map[string]string{"apiKey": "invalid-key"},
			mockServer:     true,
			mockResponse:   http.StatusUnauthorized,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Authentication failed: Invalid credentials for cloud deployment",
		},
		{
			name:           "authentication failure - forbidden",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{"apiSecret": "invalid-secret"},
			mockServer:     true,
			mockResponse:   http.StatusForbidden,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Authentication failed: Invalid credentials for self-hosted deployment",
		},
		{
			name:           "cube API error response",
			jsonData:       `{"cubeApiUrl": "%s", "deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     true,
			mockResponse:   http.StatusInternalServerError,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Cube API returned status 500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var server *httptest.Server
			var jsonData string

			if tt.mockServer {
				// Create mock Cube API server
				server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					// Verify the endpoint is /cubejs-api/v1/meta
					if !strings.HasSuffix(r.URL.Path, "/cubejs-api/v1/meta") {
						t.Errorf("Expected /cubejs-api/v1/meta endpoint, got %s", r.URL.Path)
					}

					// Verify Authorization header for authenticated deployment types
					if tt.secureJsonData["apiKey"] != "" || tt.secureJsonData["apiSecret"] != "" {
						authHeader := r.Header.Get("Authorization")
						if authHeader == "" && tt.mockResponse == http.StatusOK {
							t.Error("Expected Authorization header but none was provided")
						}
						if authHeader != "" && !strings.HasPrefix(authHeader, "Bearer ") {
							t.Errorf("Expected Bearer token, got %s", authHeader)
						}
					}

					w.WriteHeader(tt.mockResponse)
					if tt.mockResponse == http.StatusOK {
						w.Header().Set("Content-Type", "application/json")
						_, _ = w.Write([]byte(`{"cubes": []}`))
					} else if tt.mockResponse >= 400 {
						_, _ = w.Write([]byte(`{"error": "test error"}`))
					}
				}))
				defer server.Close()

				// Replace %s in jsonData with server URL
				jsonData = strings.Replace(tt.jsonData, "%s", server.URL, 1)
			} else {
				jsonData = tt.jsonData
			}

			ds := &Datasource{}

			req := &backend.CheckHealthRequest{
				PluginContext: backend.PluginContext{
					DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
						JSONData:                []byte(jsonData),
						DecryptedSecureJSONData: tt.secureJsonData,
					},
				},
			}

			res, err := ds.CheckHealth(context.Background(), req)
			if err != nil {
				t.Fatalf("CheckHealth returned unexpected error: %v", err)
			}

			if res.Status != tt.expectedStatus {
				t.Errorf("Expected status %v, got %v", tt.expectedStatus, res.Status)
			}

			if !strings.Contains(res.Message, tt.expectedMsg) {
				t.Errorf("Expected message to contain '%s', got '%s'", tt.expectedMsg, res.Message)
			}
		})
	}
}

func TestCheckHealthConnectionFailure(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"cubeApiUrl": "http://localhost:9999", "deploymentType": "self-hosted-dev"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}

	res, err := ds.CheckHealth(context.Background(), req)
	if err != nil {
		t.Fatalf("CheckHealth returned unexpected error: %v", err)
	}

	if res.Status != backend.HealthStatusError {
		t.Errorf("Expected error status, got %v", res.Status)
	}

	if !strings.Contains(res.Message, "Failed to connect to Cube API") {
		t.Errorf("Expected connection failure message, got '%s'", res.Message)
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
						t.Errorf("Index %d: expected nil time, got %v", i, timeVal)
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
		data.NewField("orders.raw_orders_order_date", nil, []*string{&dateStr1, &dateStr2}),
	)

	// The field appears in Dimensions (not TimeDimensions) but has type "time"
	annotation := CubeAnnotation{
		TimeDimensions: map[string]CubeFieldInfo{}, // Empty - not a time dimension query
		Dimensions: map[string]CubeFieldInfo{
			"orders.raw_orders_order_date": {Title: "Order Date", Type: "time"},
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
					JSONData: []byte(`{"cubeApiUrl": "` + server.URL + `", "deploymentType": "self-hosted-dev"}`),
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
