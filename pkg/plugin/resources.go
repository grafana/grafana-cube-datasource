package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// TagKey represents a tag key for AdHoc filtering
type TagKey struct {
	Text  string `json:"text"`
	Value string `json:"value"`
}

// TagValue represents a tag value for AdHoc filtering
type TagValue struct {
	Text string `json:"text"`
}

// MetadataResponse represents the response for the metadata endpoint
type MetadataResponse struct {
	Dimensions []SelectOption `json:"dimensions"`
	Measures   []SelectOption `json:"measures"`
}

// SelectOption represents an option for select components.
// The Description field maps to Grafana's SelectableValue.description,
// which MultiSelect renders as subtitle text below each option label.
type SelectOption struct {
	Label       string `json:"label"`
	Value       string `json:"value"`
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
}

// ModelFile represents a data model file from Cube
type ModelFile struct {
	FileName string `json:"fileName"`
	Content  string `json:"content"`
}

// ModelFilesResponse represents the response for the model-files endpoint
type ModelFilesResponse struct {
	Files []ModelFile `json:"files"`
}

// DbSchemaResponse represents the response for the db-schema endpoint
type DbSchemaResponse struct {
	TablesSchema map[string]interface{} `json:"tablesSchema"`
}

// GenerateSchemaRequest represents the request for the generate-schema endpoint
type GenerateSchemaRequest struct {
	Format       string                 `json:"format"`
	Tables       [][]string             `json:"tables"`
	TablesSchema map[string]interface{} `json:"tablesSchema"`
}

// GenerateSchemaResponse represents the response for the generate-schema endpoint
type GenerateSchemaResponse struct {
	Files []GeneratedSchemaFile `json:"files"`
}

// GeneratedSchemaFile represents a generated schema file
type GeneratedSchemaFile struct {
	FileName string `json:"fileName"`
	Content  string `json:"content"`
}

// CubeSQLResponse represents the response from Cube's /v1/sql endpoint
type CubeSQLResponse struct {
	SQL struct {
		SQL []interface{} `json:"sql"` // [sqlString, parameters]
	} `json:"sql"`
}

// CallResource handles resource calls for AdHoc filtering
func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	switch req.Path {
	case "tag-values":
		return d.handleTagValues(ctx, req, sender)
	case "sql":
		return d.handleSQLCompilation(ctx, req, sender)
	case "metadata":
		return d.handleMetadata(ctx, req, sender)
	case "model-files":
		return d.handleModelFiles(ctx, req, sender)
	case "db-schema":
		return d.handleDbSchema(ctx, req, sender)
	case "generate-schema":
		if !isAdmin(req) {
			return sender.Send(accessDeniedResponse())
		}
		return d.handleGenerateSchema(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: 404,
			Body:   []byte(`{"error": "not found"}`),
		})
	}
}

func isAdmin(req *backend.CallResourceRequest) bool {
	return req.PluginContext.User != nil && req.PluginContext.User.Role == "Admin"
}

func accessDeniedResponse() *backend.CallResourceResponse {
	return &backend.CallResourceResponse{
		Status: 403,
		Body:   []byte(`{"error":"access denied"}`),
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	}
}

func jsonErrorResponse(status int, err error) *backend.CallResourceResponse {
	body, marshalErr := json.Marshal(map[string]string{"error": err.Error()})
	if marshalErr != nil {
		body = []byte(`{"error":"internal server error"}`)
	}

	return &backend.CallResourceResponse{
		Status: status,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	}
}

// handleMetadata returns dimensions and measures for the query builder
func (d *Datasource) handleMetadata(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch metadata from Cube API
	metaResponse, err := d.fetchCubeMetadata(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube metadata", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to fetch metadata from Cube API")))
	}

	// Extract dimensions and measures from metadata
	metadata := d.extractMetadataFromResponse(metaResponse)

	// Marshal response
	body, err := json.Marshal(metadata)
	if err != nil {
		backend.Logger.Error("Failed to marshal metadata response", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// extractMetadataFromResponse extracts dimensions and measures from Cube metadata
func (d *Datasource) extractMetadataFromResponse(metaResponse *CubeMetaResponse) MetadataResponse {
	var dimensions []SelectOption
	var measures []SelectOption

	// Filter to only include views from the cubes array
	var views []CubeMeta
	var cubes []CubeMeta
	for _, cube := range metaResponse.Cubes {
		if cube.Type == "view" {
			views = append(views, cube)
		} else {
			cubes = append(cubes, cube)
		}
	}

	// Use views if available (they represent the curated data model), otherwise fall back to cubes
	var itemsToProcess []CubeMeta
	if len(views) > 0 {
		itemsToProcess = views
		backend.Logger.Debug("Using views for metadata", "viewCount", len(views))
	} else {
		itemsToProcess = cubes
		backend.Logger.Debug("Using cubes for metadata (no views found)", "cubeCount", len(cubes))
	}

	// Track processed items to avoid duplicates
	processedDimensions := make(map[string]bool)
	processedMeasures := make(map[string]bool)

	// Iterate through views/cubes and collect dimensions and measures
	for _, item := range itemsToProcess {
		// Collect dimensions
		for _, dimension := range item.Dimensions {
			if !processedDimensions[dimension.Name] {
				dimensions = append(dimensions, SelectOption{
					Label:       dimension.Name,
					Value:       dimension.Name,
					Type:        dimension.Type,
					Description: dimension.Description,
				})
				processedDimensions[dimension.Name] = true
			}
		}

		// Collect measures
		for _, measure := range item.Measures {
			if !processedMeasures[measure.Name] {
				measures = append(measures, SelectOption{
					Label:       measure.Name,
					Value:       measure.Name,
					Type:        measure.Type,
					Description: measure.Description,
				})
				processedMeasures[measure.Name] = true
			}
		}
	}

	backend.Logger.Debug("Extracted metadata", "dimensions", len(dimensions), "measures", len(measures))

	return MetadataResponse{
		Dimensions: dimensions,
		Measures:   measures,
	}
}

// handleTagValues returns available tag values for a given tag key (dimension)
// It queries the Cube /v1/load endpoint with just the dimension to get distinct values
func (d *Datasource) handleTagValues(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Parse the URL to get the key parameter
	parsedURL, err := url.Parse(req.URL)
	if err != nil {
		return sender.Send(jsonErrorResponse(400, errors.New("invalid URL")))
	}

	key := parsedURL.Query().Get("key")
	if key == "" {
		return sender.Send(jsonErrorResponse(400, errors.New("key parameter is required")))
	}

	// Build a Cube query to get distinct values for this dimension
	cubeQuery := map[string]interface{}{
		"dimensions": []string{key},
		"limit":      10000, // Limit for tag value suggestions
	}

	// Parse existing filters to scope the results (like Prometheus does)
	filtersJSON := parsedURL.Query().Get("filters")
	if filtersJSON != "" {
		var scopingFilters []map[string]interface{}
		if err := json.Unmarshal([]byte(filtersJSON), &scopingFilters); err != nil {
			backend.Logger.Warn("Failed to parse scoping filters, ignoring", "error", err)
		} else if len(scopingFilters) > 0 {
			cubeQuery["filters"] = scopingFilters
			backend.Logger.Debug("Scoping tag values with existing filters", "filters", scopingFilters)
		}
	}

	cubeQueryJSON, err := json.Marshal(cubeQuery)
	if err != nil {
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal query")))
	}

	// Build API URL
	apiReq, err := d.buildAPIURL(req.PluginContext, "load")
	if err != nil {
		backend.Logger.Error("Failed to build API URL for tag values", "error", err)
		return sender.Send(jsonErrorResponse(500, fmt.Errorf("failed to build API URL: %w", err)))
	}

	// Add query parameter
	u, err := url.Parse(apiReq.URL.String())
	if err != nil {
		return sender.Send(jsonErrorResponse(500, errors.New("failed to parse API URL")))
	}

	params := url.Values{}
	params.Add("query", string(cubeQueryJSON))
	u.RawQuery = params.Encode()

	// Use shared helper to make the request with "Continue wait" polling
	body, err := d.doCubeLoadRequest(ctx, u.String(), apiReq.Config)
	if err != nil {
		backend.Logger.Error("Failed to fetch tag values from Cube API", "error", err)
		// If this is a Cube API error (non-200), forward the original status code and body
		var cubeErr *CubeAPIError
		if errors.As(err, &cubeErr) {
			return sender.Send(&backend.CallResourceResponse{
				Status: cubeErr.StatusCode,
				Body:   cubeErr.Body,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
			})
		}
		// For other errors (timeouts, network, etc.), return 500 with safely encoded JSON
		return sender.Send(jsonErrorResponse(500, err))
	}

	// Parse the Cube API response
	var apiResponse CubeAPIResponse
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		backend.Logger.Error("Failed to parse Cube API response for tag values", "error", err, "body", string(body))
		return sender.Send(jsonErrorResponse(500, errors.New("failed to parse API response")))
	}

	// Extract unique values from the response data
	// Response format for Grafana: [{ "text": "value1" }, { "text": "value2" }]
	tagValues := []TagValue{}
	seen := make(map[string]bool)

	for _, row := range apiResponse.Data {
		if value, ok := row[key]; ok && value != nil {
			// Convert value to string
			var strValue string
			switch v := value.(type) {
			case string:
				strValue = v
			case float64:
				strValue = fmt.Sprintf("%v", v)
			case bool:
				strValue = fmt.Sprintf("%v", v)
			default:
				strValue = fmt.Sprintf("%v", v)
			}

			// Only add unique values
			if !seen[strValue] {
				seen[strValue] = true
				tagValues = append(tagValues, TagValue{Text: strValue})
			}
		}
	}

	// Marshal response
	responseBody, err := json.Marshal(tagValues)
	if err != nil {
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   responseBody,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// handleSQLCompilation compiles a Cube query to SQL using Cube's /v1/sql endpoint
func (d *Datasource) handleSQLCompilation(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Parse the URL to get query parameters
	parsedURL, err := url.Parse(req.URL)
	if err != nil {
		return sender.Send(jsonErrorResponse(400, errors.New("invalid URL")))
	}

	// Get the query from URL parameters
	queryParam := parsedURL.Query().Get("query")
	if queryParam == "" {
		return sender.Send(jsonErrorResponse(400, errors.New("query parameter is required")))
	}

	// Validate that it's valid JSON
	var cubeQuery CubeQuery
	if err := json.Unmarshal([]byte(queryParam), &cubeQuery); err != nil {
		return sender.Send(jsonErrorResponse(400, errors.New("invalid query JSON")))
	}

	// Fetch SQL from Cube API
	sqlString, err := d.fetchCubeSQL(ctx, req.PluginContext, queryParam)
	if err != nil {
		backend.Logger.Error("Failed to fetch SQL from Cube", "error", err)
		return sender.Send(jsonErrorResponse(500, err))
	}

	// Return the SQL string
	sqlJSON := map[string]string{"sql": sqlString}
	responseBody, err := json.Marshal(sqlJSON)
	if err != nil {
		backend.Logger.Error("Failed to marshal SQL response", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   responseBody,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// fetchCubeSQL compiles a Cube query to SQL using Cube's /v1/sql endpoint
func (d *Datasource) fetchCubeSQL(ctx context.Context, pluginContext backend.PluginContext, query string) (string, error) {
	// Build API URL and load configuration
	apiReq, err := d.buildAPIURL(pluginContext, "sql")
	if err != nil {
		return "", fmt.Errorf("failed to build API URL: %w", err)
	}

	// Add query parameter
	u, err := url.Parse(apiReq.URL.String())
	if err != nil {
		return "", fmt.Errorf("failed to parse API URL: %w", err)
	}

	params := url.Values{}
	params.Add("query", query)
	u.RawQuery = params.Encode()

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Add authentication headers
	if err := d.addAuthHeaders(req, apiReq.Config); err != nil {
		return "", fmt.Errorf("failed to add auth headers: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	// Make the HTTP request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to make API request: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			backend.Logger.Warn("Failed to close response body", "error", err)
		}
	}()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// Check response status
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse the SQL API response
	var sqlResponse CubeSQLResponse
	if err := json.Unmarshal(body, &sqlResponse); err != nil {
		return "", fmt.Errorf("failed to parse API response: %w", err)
	}

	// Extract SQL string from nested structure: response.sql.sql[0]
	if len(sqlResponse.SQL.SQL) == 0 {
		return "", fmt.Errorf("SQL array is empty")
	}

	sql, ok := sqlResponse.SQL.SQL[0].(string)
	if !ok {
		return "", fmt.Errorf("SQL response is not a string")
	}

	return sql, nil
}

// handleModelFiles fetches data model files from the Cube API
func (d *Datasource) handleModelFiles(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch model files from Cube API
	modelFiles, err := d.fetchCubeModelFiles(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube model files", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to fetch model files from Cube API")))
	}

	// Marshal response
	body, err := json.Marshal(modelFiles)
	if err != nil {
		backend.Logger.Error("Failed to marshal model files response", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// fetchCubeModelFiles fetches model files from Cube's /playground/files endpoint
func (d *Datasource) fetchCubeModelFiles(ctx context.Context, pluginContext backend.PluginContext) (*ModelFilesResponse, error) {
	// Build base URL and load configuration
	apiReq, err := d.buildAPIURL(pluginContext, "")
	if err != nil {
		return nil, err
	}

	// Get base URL with test override support
	baseURL := apiReq.Config.CubeApiUrl
	if d.BaseURL != "" {
		// Override for testing
		baseURL = d.BaseURL
	}

	// Construct playground files URL
	baseURL = strings.TrimRight(baseURL, "/")
	filesURL := baseURL + "/playground/files"

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", filesURL, nil)
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

	// Parse the API response - Cube returns an object with files array
	var cubeFilesResponse struct {
		Files []struct {
			FileName string `json:"fileName"`
			Content  string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(body, &cubeFilesResponse); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	// Convert to our response format
	modelFiles := make([]ModelFile, len(cubeFilesResponse.Files))
	for i, file := range cubeFilesResponse.Files {
		modelFiles[i] = ModelFile{
			FileName: file.FileName,
			Content:  file.Content,
		}
	}

	return &ModelFilesResponse{
		Files: modelFiles,
	}, nil
}

// handleDbSchema fetches database schema information from the Cube API
func (d *Datasource) handleDbSchema(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch database schema from Cube API
	dbSchema, err := d.fetchCubeDbSchema(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube database schema", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to fetch database schema from Cube API")))
	}

	// Marshal response
	body, err := json.Marshal(dbSchema)
	if err != nil {
		backend.Logger.Error("Failed to marshal database schema response", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// fetchCubeDbSchema fetches database schema from Cube's /playground/db-schema endpoint
func (d *Datasource) fetchCubeDbSchema(ctx context.Context, pluginContext backend.PluginContext) (*DbSchemaResponse, error) {
	// Build base URL and load configuration
	apiReq, err := d.buildAPIURL(pluginContext, "")
	if err != nil {
		return nil, err
	}

	// Get base URL with test override support
	baseURL := apiReq.Config.CubeApiUrl
	if d.BaseURL != "" {
		// Override for testing
		baseURL = d.BaseURL
	}

	// Construct playground db-schema URL
	baseURL = strings.TrimRight(baseURL, "/")
	dbSchemaURL := baseURL + "/playground/db-schema"

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", dbSchemaURL, nil)
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

	// Parse the API response - Cube returns { tablesSchema: <schema_data> }
	var cubeDbSchemaResponse struct {
		TablesSchema map[string]interface{} `json:"tablesSchema"`
	}
	if err := json.Unmarshal(body, &cubeDbSchemaResponse); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	return &DbSchemaResponse{
		TablesSchema: cubeDbSchemaResponse.TablesSchema,
	}, nil
}

// handleGenerateSchema generates Cube schema files from database schema
func (d *Datasource) handleGenerateSchema(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Only allow POST requests
	if req.Method != "POST" {
		return sender.Send(jsonErrorResponse(405, errors.New("method not allowed")))
	}

	// Parse request body
	var generateSchemaReq GenerateSchemaRequest
	if err := json.Unmarshal(req.Body, &generateSchemaReq); err != nil {
		backend.Logger.Error("Failed to parse generate schema request", "error", err)
		return sender.Send(jsonErrorResponse(400, errors.New("invalid request body")))
	}

	// Generate schema using Cube API
	schemaResponse, err := d.fetchCubeGenerateSchema(ctx, req.PluginContext, &generateSchemaReq)
	if err != nil {
		backend.Logger.Error("Failed to generate cube schema", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to generate schema from Cube API")))
	}

	// Marshal response
	body, err := json.Marshal(schemaResponse)
	if err != nil {
		backend.Logger.Error("Failed to marshal generate schema response", "error", err)
		return sender.Send(jsonErrorResponse(500, errors.New("failed to marshal response")))
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// fetchCubeGenerateSchema generates schema files from Cube's /playground/generate-schema endpoint
func (d *Datasource) fetchCubeGenerateSchema(ctx context.Context, pluginContext backend.PluginContext, generateSchemaReq *GenerateSchemaRequest) (*GenerateSchemaResponse, error) {
	// Build base URL and load configuration
	apiReq, err := d.buildAPIURL(pluginContext, "")
	if err != nil {
		return nil, err
	}

	// Get base URL with test override support
	baseURL := apiReq.Config.CubeApiUrl
	if d.BaseURL != "" {
		// Override for testing
		baseURL = d.BaseURL
	}

	// Construct playground generate-schema URL
	baseURL = strings.TrimRight(baseURL, "/")
	generateSchemaURL := baseURL + "/playground/generate-schema"

	// Marshal request body
	requestBody, err := json.Marshal(generateSchemaReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", generateSchemaURL, strings.NewReader(string(requestBody)))
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

	// Parse the API response - Cube returns { files: [{ fileName: "...", content: "..." }] }
	var cubeGenerateSchemaResponse struct {
		Files []struct {
			FileName string `json:"fileName"`
			Content  string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(body, &cubeGenerateSchemaResponse); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	// Convert to our response format
	generatedFiles := make([]GeneratedSchemaFile, len(cubeGenerateSchemaResponse.Files))
	for i, file := range cubeGenerateSchemaResponse.Files {
		generatedFiles[i] = GeneratedSchemaFile{
			FileName: file.FileName,
			Content:  file.Content,
		}
	}

	return &GenerateSchemaResponse{
		Files: generatedFiles,
	}, nil
}
