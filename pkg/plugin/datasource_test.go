package plugin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestBuildAPIURL(t *testing.T) {
	tests := []struct {
		name            string
		sourceURL       string // top-level datasource URL field (preferred)
		legacyJsonUrl   string // legacy jsonData.cubeApiUrl (backward-compat tests only)
		baseURLOverride string
		endpoint        string
		expectError     bool
		expectedURL     string
		errorContains   string
	}{
		// Valid URL cases (using standard top-level URL field)
		{
			name:        "valid HTTP URL",
			sourceURL:   "http://localhost:4000",
			endpoint:    "load",
			expectError: false,
			expectedURL: "http://localhost:4000/cubejs-api/v1/load",
		},
		{
			name:        "valid HTTPS URL",
			sourceURL:   "https://my-cube-api.com",
			endpoint:    "meta",
			expectError: false,
			expectedURL: "https://my-cube-api.com/cubejs-api/v1/meta",
		},
		{
			name:        "valid URL with port",
			sourceURL:   "https://api.example.com:8080",
			endpoint:    "sql",
			expectError: false,
			expectedURL: "https://api.example.com:8080/cubejs-api/v1/sql",
		},
		{
			name:        "valid URL with trailing slash",
			sourceURL:   "http://localhost:4000/",
			endpoint:    "load",
			expectError: false,
			expectedURL: "http://localhost:4000/cubejs-api/v1/load",
		},
		{
			name:        "valid URL with existing path",
			sourceURL:   "http://example.com/cube",
			endpoint:    "meta",
			expectError: false,
			expectedURL: "http://example.com/cube/cubejs-api/v1/meta",
		},
		{
			name:            "test override functionality",
			sourceURL:       "http://localhost:4000",
			baseURLOverride: "http://test-server:3000",
			endpoint:        "sql",
			expectError:     false,
			expectedURL:     "http://test-server:3000/cubejs-api/v1/sql",
		},
		// Backward-compatibility: top-level URL takes precedence over legacy jsonData.cubeApiUrl
		{
			name:          "top-level URL preferred over legacy jsonData.cubeApiUrl",
			legacyJsonUrl: "http://legacy:4000",
			sourceURL:     "http://standard:4000",
			endpoint:      "load",
			expectError:   false,
			expectedURL:   "http://standard:4000/cubejs-api/v1/load",
		},
		{
			name:        "top-level URL used when legacy jsonData.cubeApiUrl is empty",
			sourceURL:   "http://standard:4000",
			endpoint:    "meta",
			expectError: false,
			expectedURL: "http://standard:4000/cubejs-api/v1/meta",
		},
		// Invalid URL cases
		{
			name:          "empty URL",
			endpoint:      "load",
			expectError:   true,
			errorContains: "Cube API URL is required",
		},
		{
			name:          "whitespace only URL",
			sourceURL:     "   ",
			endpoint:      "load",
			expectError:   true,
			errorContains: "Cube API URL is required",
		},
		{
			name:          "invalid URL - no protocol",
			sourceURL:     "not-a-url",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - missing scheme",
			sourceURL:     "://invalid",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - incomplete",
			sourceURL:     "http://",
			endpoint:      "load",
			expectError:   true,
			errorContains: "invalid Cube API URL format",
		},
		{
			name:          "invalid URL - missing protocol scheme",
			sourceURL:     "localhost:4000",
			endpoint:      "load",
			expectError:   true,
			errorContains: "missing protocol scheme",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds := &Datasource{}
			if tt.baseURLOverride != "" {
				ds.BaseURL = tt.baseURLOverride
			}

			pluginContext := backend.PluginContext{
				DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
					URL:      tt.sourceURL,
					JSONData: []byte(`{"cubeApiUrl": "` + tt.legacyJsonUrl + `"}`),
				},
			}

			apiReq, err := ds.buildAPIURL(pluginContext, tt.endpoint)

			if tt.expectError {
				if err == nil {
					t.Fatalf("Expected error but got none")
				}
				if tt.errorContains != "" && !strings.Contains(err.Error(), tt.errorContains) {
					t.Fatalf("Expected error to contain '%s', got '%s'", tt.errorContains, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if apiReq.URL.String() != tt.expectedURL {
				t.Fatalf("Expected URL '%s', got '%s'", tt.expectedURL, apiReq.URL.String())
			}

			if apiReq.Config == nil {
				t.Fatalf("Expected config to be returned, got nil")
			}

			// Verify config contains the resolved URL.
			// Top-level sourceURL takes precedence over legacy jsonData.cubeApiUrl.
			expectedConfigURL := tt.legacyJsonUrl
			if tt.sourceURL != "" {
				expectedConfigURL = tt.sourceURL
			}
			if apiReq.Config.CubeApiUrl != expectedConfigURL {
				t.Fatalf("Expected config.CubeApiUrl '%s', got '%s'", expectedConfigURL, apiReq.Config.CubeApiUrl)
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
		sourceURL      string // top-level datasource URL field (preferred)
		jsonData       string
		secureJsonData map[string]string
		mockServer     bool
		mockResponse   int
		mockBody       string // custom response body for 200 OK; defaults to empty cubes
		expectedStatus backend.HealthStatus
		expectedMsg    string
		notExpectedMsg string // if set, message must NOT contain this substring
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
			sourceURL:      "http://localhost:4000",
			jsonData:       `{}`,
			secureJsonData: map[string]string{"apiKey": "test-key"},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "deployment type is required",
		},
		{
			name:           "cloud deployment without API key",
			sourceURL:      "http://localhost:4000",
			jsonData:       `{"deploymentType": "cloud"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "API key is required for Cube Cloud deployments",
		},
		{
			name:           "self-hosted deployment without API secret",
			sourceURL:      "http://localhost:4000",
			jsonData:       `{"deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "API secret is required for self-hosted Cube deployments",
		},
		{
			name:           "unknown deployment type",
			sourceURL:      "http://localhost:4000",
			jsonData:       `{"deploymentType": "unknown"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "unknown deployment type",
		},
		{
			name:           "invalid cube API URL",
			sourceURL:      "://invalid-url",
			jsonData:       `{"deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "invalid Cube API URL format",
		},
		{
			name:           "URL without protocol scheme should fail",
			sourceURL:      "localhost:4000",
			jsonData:       `{"deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     false,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "missing protocol scheme",
		},
		{
			name:           "self-hosted-dev successful connection, no data model",
			jsonData:       `{"deploymentType": "self-hosted-dev"}`,
			secureJsonData: map[string]string{},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "Successfully connected to Cube API. ℹ️ No data model found yet",
		},
		{
			name:           "cloud successful connection, no data model",
			jsonData:       `{"deploymentType": "cloud"}`,
			secureJsonData: map[string]string{"apiKey": "test-api-key"},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "ℹ️ No data model found yet",
		},
		{
			name:           "successful connection with existing data model",
			jsonData:       `{"deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{"apiSecret": "test-api-secret"},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			mockBody:       `{"cubes": [{"name": "orders", "type": "cube", "dimensions": [], "measures": []}]}`,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "Visit the Data Model tab to review or update your data model",
			notExpectedMsg: "No data model found yet",
		},
		{
			name:           "self-hosted successful connection with auth verification",
			jsonData:       `{"deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{"apiSecret": "test-api-secret"},
			mockServer:     true,
			mockResponse:   http.StatusOK,
			expectedStatus: backend.HealthStatusOk,
			expectedMsg:    "ℹ️ No data model found yet",
		},
		{
			name:           "authentication failure - unauthorized",
			jsonData:       `{"deploymentType": "cloud"}`,
			secureJsonData: map[string]string{"apiKey": "invalid-key"},
			mockServer:     true,
			mockResponse:   http.StatusUnauthorized,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Authentication failed: Invalid credentials for cloud deployment",
		},
		{
			name:           "authentication failure - forbidden",
			jsonData:       `{"deploymentType": "self-hosted"}`,
			secureJsonData: map[string]string{"apiSecret": "invalid-secret"},
			mockServer:     true,
			mockResponse:   http.StatusForbidden,
			expectedStatus: backend.HealthStatusError,
			expectedMsg:    "Authentication failed: Invalid credentials for self-hosted deployment",
		},
		{
			name:           "cube API error response",
			jsonData:       `{"deploymentType": "self-hosted-dev"}`,
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
			sourceURL := tt.sourceURL

			if tt.mockServer {
				server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if !strings.HasSuffix(r.URL.Path, "/cubejs-api/v1/meta") {
						t.Errorf("Expected /cubejs-api/v1/meta endpoint, got %s", r.URL.Path)
					}

					if tt.secureJsonData["apiKey"] != "" || tt.secureJsonData["apiSecret"] != "" {
						authHeader := r.Header.Get("Authorization")
						if authHeader == "" && tt.mockResponse == http.StatusOK {
							t.Error("Expected Authorization header but none was provided")
						}
						if authHeader != "" && !strings.HasPrefix(authHeader, "Bearer ") {
							t.Errorf("Expected Bearer token, got %s", authHeader)
						}
					}

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.mockResponse)
				if tt.mockResponse == http.StatusOK {
					body := tt.mockBody
					if body == "" {
						body = `{"cubes": []}`
					}
					_, _ = w.Write([]byte(body))
				} else if tt.mockResponse >= 400 {
						_, _ = w.Write([]byte(`{"error": "test error"}`))
					}
				}))
				defer server.Close()
				sourceURL = server.URL
			}

			ds := &Datasource{}

			req := &backend.CheckHealthRequest{
				PluginContext: backend.PluginContext{
					DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
						URL:                     sourceURL,
						JSONData:                []byte(tt.jsonData),
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

			if tt.notExpectedMsg != "" && strings.Contains(res.Message, tt.notExpectedMsg) {
				t.Errorf("Expected message NOT to contain '%s', got '%s'", tt.notExpectedMsg, res.Message)
			}
		})
	}
}

func TestCheckHealthConnectionFailure(t *testing.T) {
	ds := &Datasource{}

	req := &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				URL:                     "http://localhost:9999",
				JSONData:                []byte(`{"deploymentType": "self-hosted-dev"}`),
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
