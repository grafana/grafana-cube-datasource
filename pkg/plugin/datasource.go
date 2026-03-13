package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/grafana/cube/pkg/models"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
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

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	// BaseURL allows overriding the Cube API URL for testing
	BaseURL string

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
	message := "Successfully connected to Cube API"
	if apiReq.Config.DeploymentType != "self-hosted-dev" {
		message += " and verified authentication"
	}

	// Parse meta response to check whether a data model exists.
	// When no cubes are defined, nudge the user toward the Data Model tab
	// instead of letting Grafana's default "build a dashboard" message appear.
	body, _ := io.ReadAll(metaResp.Body)
	var metaResponse CubeMetaResponse
	if err := json.Unmarshal(body, &metaResponse); err == nil && len(metaResponse.Cubes) == 0 {
		message += ". ℹ️ No data model found yet — visit the Data Model tab to get started"
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: message,
	}, nil
}

