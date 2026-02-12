package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/grafana/cube/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler, backend.CallResourceHandler interfaces. Plugin should not implement all these
// interfaces - only those which are required for a particular task.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(_ context.Context, _ backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return &Datasource{
		jwtCache: make(map[string]jwtCacheEntry),
	}, nil
}

// jwtCacheEntry represents a cached JWT token with its expiration time
type jwtCacheEntry struct {
	token      string
	expiration time.Time
}

// defaultContinueWaitPollInterval is the default time to wait between retries
// when Cube returns a "Continue wait" response.  Matches the @cubejs-client/core
// default of 5 seconds.
const defaultContinueWaitPollInterval = 5 * time.Second

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	// BaseURL allows overriding the Cube API URL for testing
	BaseURL string

	// ContinueWaitPollInterval overrides the polling interval for "Continue wait"
	// responses.  Zero means use the default (5s).  Intended for testing.
	ContinueWaitPollInterval time.Duration

	// JWT cache keyed by API secret
	jwtCache      map[string]jwtCacheEntry
	jwtCacheMutex sync.RWMutex
}

// CubeAPIURL represents a fully constructed Cube API endpoint URL
type CubeAPIURL string

// String implements fmt.Stringer for automatic string conversion
func (u CubeAPIURL) String() string {
	return string(u)
}

// APIRequestContext contains the validated API URL and plugin settings needed for making requests.
// This groups related data together to avoid data clumps.
type APIRequestContext struct {
	URL    CubeAPIURL
	Config *models.PluginSettings
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
}

// validateCredentials checks that the required credentials are present for the deployment type.
// Returns an error if credentials are missing or deployment type is invalid.
func validateCredentials(config *models.PluginSettings) error {
	if config.DeploymentType == "" {
		return fmt.Errorf("deployment type is required")
	}

	switch config.DeploymentType {
	case "cloud":
		if config.Secrets.ApiKey == "" {
			return fmt.Errorf("API key is required for Cube Cloud deployments")
		}
	case "self-hosted":
		if config.Secrets.ApiSecret == "" {
			return fmt.Errorf("API secret is required for self-hosted Cube deployments")
		}
	case "self-hosted-dev":
		// No credentials required for dev mode
	default:
		return fmt.Errorf("unknown deployment type: %s", config.DeploymentType)
	}

	return nil
}

// addAuthHeaders sets the Authorization header based on the deployment type.
// It validates that credentials are present before attempting to add headers.
func (d *Datasource) addAuthHeaders(req *http.Request, config *models.PluginSettings) error {
	// Validate credentials first
	if err := validateCredentials(config); err != nil {
		return err
	}

	switch config.DeploymentType {
	case "cloud":
		// Cube Cloud: Use API key as Bearer token
		req.Header.Set("Authorization", "Bearer "+config.Secrets.ApiKey)
	case "self-hosted":
		// Self-hosted: Generate JWT token using API secret
		token, err := d.generateJWT(config.Secrets.ApiSecret)
		if err != nil {
			return fmt.Errorf("failed to generate JWT: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
	case "self-hosted-dev":
		// Self-hosted development mode: No authentication
		// Do nothing
	}
	return nil
}

// generateJWT creates a JWT token for self-hosted Cube authentication.
// It caches tokens until near expiration (55 minutes) to reduce signing operations.
func (d *Datasource) generateJWT(secret string) (string, error) {
	// Initialize cache if needed (for tests that create Datasource directly)
	d.jwtCacheMutex.Lock()
	if d.jwtCache == nil {
		d.jwtCache = make(map[string]jwtCacheEntry)
	}
	d.jwtCacheMutex.Unlock()

	// Fast path: Check cache with read lock
	d.jwtCacheMutex.RLock()
	if cached, exists := d.jwtCache[secret]; exists {
		// Check if token is still valid (not expired and not near expiration)
		// Cache until 55 minutes to ensure we refresh before the 1-hour expiration
		if time.Now().Before(cached.expiration) {
			d.jwtCacheMutex.RUnlock()
			return cached.token, nil
		}
	}
	d.jwtCacheMutex.RUnlock()

	// Slow path: Acquire write lock and double-check cache
	// This prevents multiple goroutines from generating tokens concurrently
	d.jwtCacheMutex.Lock()
	// Double-check: Another goroutine may have updated the cache while we waited for the lock
	if cached, exists := d.jwtCache[secret]; exists {
		if time.Now().Before(cached.expiration) {
			d.jwtCacheMutex.Unlock()
			return cached.token, nil
		}
	}

	// Generate new token
	// Create JWT claims with 1 hour expiration
	claims := jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
		"sub": "grafana-cube-datasource", // Identifies the token issuer
	}

	// Create token with HS256 signing method
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign the token with the API secret
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		d.jwtCacheMutex.Unlock()
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	// Cache the token until 55 minutes from now
	d.jwtCache[secret] = jwtCacheEntry{
		token:      tokenString,
		expiration: time.Now().Add(55 * time.Minute),
	}
	d.jwtCacheMutex.Unlock()

	return tokenString, nil
}

// buildAPIURL constructs a Cube API URL for the given endpoint.
// It handles loading plugin settings, URL validation, and test overrides.
func (d *Datasource) buildAPIURL(pluginContext backend.PluginContext, endpoint string) (*APIRequestContext, error) {
	// Load plugin settings
	config, err := models.LoadPluginSettings(*pluginContext.DataSourceInstanceSettings)
	if err != nil {
		return nil, fmt.Errorf("failed to load plugin settings: %w", err)
	}

	// Get base URL with test override support
	baseURL := config.CubeApiUrl
	if d.BaseURL != "" {
		// Override for testing
		baseURL = d.BaseURL
	}

	// Trim whitespace and validate URL is configured
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return nil, fmt.Errorf("Cube API URL is required") //nolint:staticcheck // Cube is a product name
	}

	// Validate URL format and required components
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid Cube API URL format: %w", err)
	}

	// Ensure URL has a scheme
	if parsedURL.Scheme == "" {
		return nil, fmt.Errorf("invalid Cube API URL format: missing protocol scheme (http:// or https://)")
	}

	// Validate scheme is http or https (file:, ftp:, etc. are invalid for Cube API)
	// If the original URL doesn't contain "://", it likely means the user forgot the protocol scheme
	// (e.g., "localhost:4000" gets parsed with scheme="localhost" instead of being recognized as missing scheme)
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		if !strings.Contains(baseURL, "://") {
			return nil, fmt.Errorf("invalid Cube API URL format: missing protocol scheme (http:// or https://)")
		}
		return nil, fmt.Errorf("invalid Cube API URL format: invalid protocol scheme %q (must be http:// or https://)", parsedURL.Scheme)
	}

	// Ensure URL has a host
	if parsedURL.Host == "" {
		return nil, fmt.Errorf("invalid Cube API URL format: missing host")
	}

	// Construct full API URL, handling trailing slashes properly
	baseURL = strings.TrimRight(baseURL, "/")
	apiURL := CubeAPIURL(baseURL + "/cubejs-api/v1/" + endpoint)

	return &APIRequestContext{
		URL:    apiURL,
		Config: config,
	}, nil
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Ensure query JSON is provided
	if len(query.JSON) == 0 {
		return backend.ErrDataResponse(backend.StatusBadRequest, "Query JSON is required")
	}

	// Debug: Log the raw JSON to see what we're actually trying to unmarshal
	backend.Logger.Debug("Raw query JSON", "rawJSON", string(query.JSON))

	// Parse the query JSON into CubeQuery struct
	var cubeQuery CubeQuery
	if err := json.Unmarshal(query.JSON, &cubeQuery); err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("Invalid query JSON: %v", err))
	}

	backend.Logger.Debug("Parsed cube query", "measures", cubeQuery.Measures, "dimensions", cubeQuery.Dimensions, "timeDimensions", cubeQuery.TimeDimensions)

	// Additional debugging: If arrays are empty, let's see the full JSON structure
	if len(cubeQuery.Measures) == 0 && len(cubeQuery.Dimensions) == 0 {
		var genericJSON map[string]interface{}
		if err := json.Unmarshal(query.JSON, &genericJSON); err == nil {
			backend.Logger.Debug("Full JSON structure", "structure", genericJSON)
		}
	}

	// Build the Cube API query JSON (only include the Cube-specific fields)
	cubeAPIQuery := map[string]interface{}{}
	if len(cubeQuery.Dimensions) > 0 {
		cubeAPIQuery["dimensions"] = cubeQuery.Dimensions
	}
	if len(cubeQuery.Measures) > 0 {
		cubeAPIQuery["measures"] = cubeQuery.Measures
	}
	if len(cubeQuery.TimeDimensions) > 0 {
		cubeAPIQuery["timeDimensions"] = cubeQuery.TimeDimensions
	}
	if len(cubeQuery.Filters) > 0 {
		cubeAPIQuery["filters"] = cubeQuery.Filters
	}
	if cubeQuery.Order != nil {
		cubeAPIQuery["order"] = cubeQuery.Order
	}
	if cubeQuery.Limit != nil {
		cubeAPIQuery["limit"] = cubeQuery.Limit
	}

	cubeAPIQueryJSON, err := json.Marshal(cubeAPIQuery)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("Failed to marshal Cube query: %v", err))
	}

	// Build API URL and load configuration
	apiReq, err := d.buildAPIURL(pCtx, "load")
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
	}

	// Add query parameter
	u, err := url.Parse(apiReq.URL.String())
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("Failed to parse API URL: %v", err))
	}

	params := url.Values{}
	params.Add("query", string(cubeAPIQueryJSON))
	u.RawQuery = params.Encode()

	// Debug: Log what we're sending to the API
	backend.Logger.Debug("Making API request", "url", u.String(), "cubeQuery", string(cubeAPIQueryJSON))

	// Use shared helper to make the request with "Continue wait" polling
	body, err := d.doCubeLoadRequest(ctx, u.String(), apiReq.Config)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
	}

	// Parse the API response
	var apiResponse CubeAPIResponse
	err = json.Unmarshal(body, &apiResponse)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("Failed to parse API response: %v", err))
	}

	// Convert string values to numbers based on type annotations
	convertedData := d.convertDataTypes(apiResponse.Data, apiResponse.Annotation)

	// Create DataFrame using framestruct utility
	frame, err := framestruct.ToDataFrame("response", convertedData)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("Failed to convert data to frame: %v", err))
	}

	// Reorder fields according to query specification (dimensions first, then measures)
	// Also adds missing fields (e.g., columns with all null values) as nullable fields
	frame = d.reorderFrameFields(frame, cubeQuery, apiResponse.Annotation, len(apiResponse.Data))

	// Mark dimension fields as filterable to enable AdHoc filter buttons
	d.markFieldsAsFilterable(frame, cubeQuery)

	// Convert time dimension strings to proper time.Time values for better UI display
	d.convertTimeDimensions(frame, apiResponse.Annotation)

	// add the frames to the response.
	response.Frames = append(response.Frames, frame)

	return response
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	res := &backend.CheckHealthResult{}

	// Use buildAPIURL to validate URL format consistently with API calls
	// This ensures health check validation matches actual API request validation
	apiReq, err := d.buildAPIURL(req.PluginContext, "meta")
	if err != nil {
		res.Status = backend.HealthStatusError
		res.Message = err.Error()
		return res, nil
	}

	// Check Cube by calling /v1/meta endpoint
	// This endpoint is accessible by default and validates both connectivity and data model
	metaReq, err := http.NewRequestWithContext(ctx, "GET", apiReq.URL.String(), nil)
	if err != nil {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("Failed to create request: %v", err)
		return res, nil
	}

	// Add authentication headers (validates credentials and adds headers)
	if err := d.addAuthHeaders(metaReq, apiReq.Config); err != nil {
		res.Status = backend.HealthStatusError
		res.Message = err.Error()
		return res, nil
	}

	client := &http.Client{}
	metaResp, err := client.Do(metaReq)
	if err != nil {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("Failed to connect to Cube API: %v", err)
		return res, nil
	}
	defer func() {
		if err := metaResp.Body.Close(); err != nil {
			backend.Logger.Error("Failed to close response body", "error", err)
		}
	}()

	// Check for authentication failures
	if metaResp.StatusCode == http.StatusUnauthorized || metaResp.StatusCode == http.StatusForbidden {
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("Authentication failed: Invalid credentials for %s deployment", apiReq.Config.DeploymentType)
		return res, nil
	}

	// Check for other errors
	if metaResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(metaResp.Body)
		res.Status = backend.HealthStatusError
		res.Message = fmt.Sprintf("Cube API returned status %d: %s", metaResp.StatusCode, string(body))
		return res, nil
	}

	// Determine success message based on deployment type
	// Dev mode is the only deployment type that doesn't require authentication
	message := "Successfully connected to Cube API"
	if apiReq.Config.DeploymentType != "self-hosted-dev" {
		message += " and verified authentication"
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: message,
	}, nil
}

// reorderFrameFields reorders the fields of a DataFrame according to the query specification.
// It also adds missing fields (e.g., columns with all null values) as nullable fields.
// The dataRowCount parameter is needed when all columns have null values (frame has no fields).
func (d *Datasource) reorderFrameFields(frame *data.Frame, query CubeQuery, annotation CubeAnnotation, dataRowCount int) *data.Frame {
	// Create a new frame with the reordered fields
	newFrame := data.NewFrame(frame.Name)

	// Create a map to track the new positions of the fields
	fieldPositions := make(map[string]int)

	// Populate the field positions map
	for i, field := range frame.Fields {
		fieldPositions[field.Name] = i
	}

	// Determine row count from existing frame (needed for creating null-filled fields)
	// Fall back to dataRowCount when frame has no fields (all columns have null values)
	rowCount := dataRowCount
	if len(frame.Fields) > 0 {
		rowCount = frame.Fields[0].Len()
	}

	// Reorder the fields according to the query specification
	// If a field doesn't exist (all null values), create it as a nullable field
	for _, fieldName := range query.Dimensions {
		if pos, exists := fieldPositions[fieldName]; exists {
			newFrame.Fields = append(newFrame.Fields, frame.Fields[pos])
		} else {
			// Field missing (all null values) - create a nullable field
			newFrame.Fields = append(newFrame.Fields, d.createNullField(fieldName, rowCount, annotation))
		}
	}

	for _, fieldName := range query.Measures {
		if pos, exists := fieldPositions[fieldName]; exists {
			newFrame.Fields = append(newFrame.Fields, frame.Fields[pos])
		} else {
			// Field missing (all null values) - create a nullable field
			newFrame.Fields = append(newFrame.Fields, d.createNullField(fieldName, rowCount, annotation))
		}
	}

	return newFrame
}

// createNullField creates a nullable field with nil values for columns that were omitted
// from the Cube API response (because all values were null).
func (d *Datasource) createNullField(fieldName string, rowCount int, annotation CubeAnnotation) *data.Field {
	// Determine the field type from annotation
	// Check all annotation maps: Dimensions, Measures, and TimeDimensions
	fieldType := "string" // default
	if info, ok := annotation.Dimensions[fieldName]; ok {
		fieldType = info.Type
	} else if info, ok := annotation.Measures[fieldName]; ok {
		fieldType = info.Type
	} else if info, ok := annotation.TimeDimensions[fieldName]; ok {
		fieldType = info.Type
	}

	// Create a nullable field with nil values based on type
	switch fieldType {
	case "number":
		values := make([]*float64, rowCount)
		return data.NewField(fieldName, nil, values)
	case "time":
		values := make([]*time.Time, rowCount)
		return data.NewField(fieldName, nil, values)
	case "boolean":
		values := make([]*bool, rowCount)
		return data.NewField(fieldName, nil, values)
	default:
		// Default to nullable string
		values := make([]*string, rowCount)
		return data.NewField(fieldName, nil, values)
	}
}

// markFieldsAsFilterable marks dimension fields as filterable to enable AdHoc filter buttons
func (d *Datasource) markFieldsAsFilterable(frame *data.Frame, query CubeQuery) {
	// Mark dimension fields as filterable
	for _, field := range frame.Fields {
		for _, dimension := range query.Dimensions {
			if field.Name == dimension {
				if field.Config == nil {
					field.Config = &data.FieldConfig{}
				}
				// Set Filterable to true to enable "Filter for value" buttons on table cell hover
				field.Config.Filterable = &[]bool{true}[0] // Convert to *bool
				break
			}
		}
	}
}

// convertTimeDimensions converts time dimension string fields to proper time.Time values.
// This enables proper time formatting and sorting in Grafana's UI.
func (d *Datasource) convertTimeDimensions(frame *data.Frame, annotation CubeAnnotation) {
	for i, field := range frame.Fields {
		// Check if this is a time dimension field (from timeDimensions annotation)
		if timeDimInfo, isTimeDim := annotation.TimeDimensions[field.Name]; isTimeDim {
			if timeDimInfo.Type == "time" {
				newField := d.convertTimeField(field)
				if newField != nil {
					frame.Fields[i] = newField
				}
				continue
			}
		}

		// Also check regular dimensions that have type "time"
		// (e.g., date fields used as regular dimensions without granularity)
		if dimInfo, isDim := annotation.Dimensions[field.Name]; isDim {
			if dimInfo.Type == "time" {
				newField := d.convertTimeField(field)
				if newField != nil {
					frame.Fields[i] = newField
				}
			}
		}
	}
}

// convertTimeField converts string time values to proper time.Time values.
// Returns nil if the field is not a string type (no conversion needed).
func (d *Datasource) convertTimeField(field *data.Field) *data.Field {
	if field.Type() != data.FieldTypeString && field.Type() != data.FieldTypeNullableString {
		return nil // Already proper type or not convertible
	}

	// Create a new time vector with the same length
	timeValues := make([]*time.Time, field.Len())

	for i := 0; i < field.Len(); i++ {
		val := field.At(i)
		if val == nil {
			continue
		}

		var timeStr string
		switch v := val.(type) {
		case string:
			timeStr = v
		case *string:
			if v != nil {
				timeStr = *v
			}
		default:
			continue
		}

		if timeStr == "" {
			continue
		}

		// Try parsing common time formats used by Cube
		if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
			timeValues[i] = &t
		} else if t, err := time.Parse("2006-01-02T15:04:05.000Z", timeStr); err == nil {
			timeValues[i] = &t
		} else if t, err := time.Parse("2006-01-02T15:04:05.000", timeStr); err == nil {
			timeValues[i] = &t
		} else if t, err := time.Parse("2006-01-02", timeStr); err == nil {
			timeValues[i] = &t
		}
		// If parsing fails, keep as nil
	}

	// Create a new time field and copy values
	newField := data.NewField(field.Name, field.Labels, timeValues)
	newField.Config = field.Config

	return newField
}

// convertDataTypes converts string values to numbers based on type annotations from Cube API
func (d *Datasource) convertDataTypes(data []map[string]interface{}, annotation CubeAnnotation) []map[string]interface{} {
	convertedData := make([]map[string]interface{}, len(data))

	// Create a combined map of all field types for easy lookup
	fieldTypes := make(map[string]string)
	for fieldName, info := range annotation.Measures {
		fieldTypes[fieldName] = info.Type
	}
	for fieldName, info := range annotation.Dimensions {
		fieldTypes[fieldName] = info.Type
	}
	for fieldName, info := range annotation.Segments {
		fieldTypes[fieldName] = info.Type
	}
	for fieldName, info := range annotation.TimeDimensions {
		fieldTypes[fieldName] = info.Type
	}

	// Convert each row
	for i, row := range data {
		convertedRow := make(map[string]interface{})
		for fieldName, value := range row {
			if fieldTypes[fieldName] == "number" {
				convertedRow[fieldName] = d.convertToNumber(value)
			} else {
				convertedRow[fieldName] = value
			}
		}
		convertedData[i] = convertedRow
	}

	return convertedData
}

// convertToNumber attempts to convert a value to a number if it's a string representation of a number
// Always return float64. Fields within Grafana DataFrame cannot have a mix of types
func (d *Datasource) convertToNumber(value interface{}) interface{} {
	switch v := value.(type) {
	case string:
		// Try to parse as float (handles both integers and decimals)
		if floatVal, err := strconv.ParseFloat(v, 64); err == nil {
			return floatVal
		}
		// If parsing fails, return the original string
		return v
	case int:
		return float64(v)
	case int8:
		return float64(v)
	case int16:
		return float64(v)
	case int32:
		return float64(v)
	case int64:
		return float64(v)
	case uint:
		return float64(v)
	case uint8:
		return float64(v)
	case uint16:
		return float64(v)
	case uint32:
		return float64(v)
	case uint64:
		return float64(v)
	case float32:
		return float64(v)
	case float64:
		return v
	default:
		// For any other type, return as is
		return v
	}
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

// doCubeLoadRequest makes a GET request to Cube's /v1/load endpoint, handling the
// "Continue wait" polling protocol. Cube returns {"error": "Continue wait"} (HTTP 200)
// when query results aren't cached yet (e.g. the upstream warehouse is still computing).
// This method polls until actual data arrives or the context is cancelled, matching the
// behavior of the official @cubejs-client/core SDK.
func (d *Datasource) doCubeLoadRequest(ctx context.Context, requestURL string, config *models.PluginSettings) ([]byte, error) {
	pollInterval := d.ContinueWaitPollInterval
	if pollInterval == 0 {
		pollInterval = defaultContinueWaitPollInterval
	}

	pollStart := time.Now()
	pollRetries := 0
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
				return nil, fmt.Errorf("request to Cube API timed out after %s (the upstream warehouse may still be computing)", elapsed)
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
			case <-time.After(pollInterval):
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

// CubeQuery represents the structure of a Cube query
type CubeQuery struct {
	RefID          string        `json:"refId"`
	Measures       []string      `json:"measures"`
	Dimensions     []string      `json:"dimensions"`
	TimeDimensions []interface{} `json:"timeDimensions,omitempty"`
	Filters        []interface{} `json:"filters,omitempty"`
	Order          interface{}   `json:"order,omitempty"`
	Limit          *int          `json:"limit,omitempty"`
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
					Label: dimension.Name,
					Value: dimension.Name,
					Type:  dimension.Type,
				})
				processedDimensions[dimension.Name] = true
			}
		}

		// Collect measures
		for _, measure := range item.Measures {
			if !processedMeasures[measure.Name] {
				measures = append(measures, SelectOption{
					Label: measure.Name,
					Value: measure.Name,
					Type:  measure.Type,
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
		return d.handleGenerateSchema(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: 404,
			Body:   []byte(`{"error": "not found"}`),
		})
	}
}

// handleMetadata returns dimensions and measures for the query builder
func (d *Datasource) handleMetadata(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch metadata from Cube API
	metaResponse, err := d.fetchCubeMetadata(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube metadata", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to fetch metadata from Cube API"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Extract dimensions and measures from metadata
	metadata := d.extractMetadataFromResponse(metaResponse)

	// Marshal response
	body, err := json.Marshal(metadata)
	if err != nil {
		backend.Logger.Error("Failed to marshal metadata response", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: 200,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// handleTagValues returns available tag values for a given tag key (dimension)
// It queries the Cube /v1/load endpoint with just the dimension to get distinct values
func (d *Datasource) handleTagValues(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Parse the URL to get the key parameter
	parsedURL, err := url.Parse(req.URL)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "invalid URL"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	key := parsedURL.Query().Get("key")
	if key == "" {
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "key parameter is required"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal query"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Build API URL
	apiReq, err := d.buildAPIURL(req.PluginContext, "load")
	if err != nil {
		backend.Logger.Error("Failed to build API URL for tag values", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(fmt.Sprintf(`{"error": "failed to build API URL: %s"}`, err.Error())),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Add query parameter
	u, err := url.Parse(apiReq.URL.String())
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to parse API URL"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
		errBody, _ := json.Marshal(map[string]string{"error": err.Error()})
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   errBody,
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Parse the Cube API response
	var apiResponse CubeAPIResponse
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		backend.Logger.Error("Failed to parse Cube API response for tag values", "error", err, "body", string(body))
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to parse API response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "invalid URL"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Get the query from URL parameters
	queryParam := parsedURL.Query().Get("query")
	if queryParam == "" {
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "query parameter is required"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Validate that it's valid JSON
	var cubeQuery CubeQuery
	if err := json.Unmarshal([]byte(queryParam), &cubeQuery); err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "invalid query JSON"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Fetch SQL from Cube API
	sqlString, err := d.fetchCubeSQL(ctx, req.PluginContext, queryParam)
	if err != nil {
		backend.Logger.Error("Failed to fetch SQL from Cube", "error", err)
		errorResponse := map[string]string{"error": err.Error()}
		errorBody, marshalErr := json.Marshal(errorResponse)
		if marshalErr != nil {
			errorBody = []byte(`{"error": "internal server error"}`)
		}
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   errorBody,
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Return the SQL string
	sqlJSON := map[string]string{"sql": sqlString}
	responseBody, err := json.Marshal(sqlJSON)
	if err != nil {
		backend.Logger.Error("Failed to marshal SQL response", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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

// CubeSQLResponse represents the response from Cube's /v1/sql endpoint
type CubeSQLResponse struct {
	SQL struct {
		SQL []interface{} `json:"sql"` // [sqlString, parameters]
	} `json:"sql"`
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
	Name       string `json:"name"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	ShortTitle string `json:"shortTitle"`
}

// CubeMeasure represents a measure in a cube
type CubeMeasure struct {
	Name       string `json:"name"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	ShortTitle string `json:"shortTitle"`
}

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

// SelectOption represents an option for select components
type SelectOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
	Type  string `json:"type"`
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

// handleModelFiles fetches data model files from the Cube API
func (d *Datasource) handleModelFiles(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch model files from Cube API
	modelFiles, err := d.fetchCubeModelFiles(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube model files", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to fetch model files from Cube API"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Marshal response
	body, err := json.Marshal(modelFiles)
	if err != nil {
		backend.Logger.Error("Failed to marshal model files response", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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

// handleDbSchema fetches database schema information from the Cube API
func (d *Datasource) handleDbSchema(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Fetch database schema from Cube API
	dbSchema, err := d.fetchCubeDbSchema(ctx, req.PluginContext)
	if err != nil {
		backend.Logger.Error("Failed to fetch cube database schema", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to fetch database schema from Cube API"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Marshal response
	body, err := json.Marshal(dbSchema)
	if err != nil {
		backend.Logger.Error("Failed to marshal database schema response", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
		return sender.Send(&backend.CallResourceResponse{
			Status: 405,
			Body:   []byte(`{"error": "method not allowed"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Parse request body
	var generateSchemaReq GenerateSchemaRequest
	if err := json.Unmarshal(req.Body, &generateSchemaReq); err != nil {
		backend.Logger.Error("Failed to parse generate schema request", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 400,
			Body:   []byte(`{"error": "invalid request body"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Generate schema using Cube API
	schemaResponse, err := d.fetchCubeGenerateSchema(ctx, req.PluginContext, &generateSchemaReq)
	if err != nil {
		backend.Logger.Error("Failed to generate cube schema", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to generate schema from Cube API"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Marshal response
	body, err := json.Marshal(schemaResponse)
	if err != nil {
		backend.Logger.Error("Failed to marshal generate schema response", "error", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: 500,
			Body:   []byte(`{"error": "failed to marshal response"}`),
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
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
