package models

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type PluginSettings struct {
	URL                     string                `json:"-"`
	DeploymentType          string                `json:"deploymentType"` // "cloud", "self-hosted", "self-hosted-dev", or "grafana-cloud"
	ExploreSqlDatasourceUid string                `json:"exploreSqlDatasourceUid"`
	AuthServiceURL          string                `json:"authServiceURL"` // Cloud Auth API base URL for grafana-cloud mode
	GrafanaURL              string                `json:"grafanaURL"`     // Base URL of this Grafana instance (currently unused; retained for provisioning compatibility)
	Secrets                 *SecretPluginSettings `json:"-"`
}

type SecretPluginSettings struct {
	ApiKey    string `json:"apiKey"`    // For Cube Cloud
	ApiSecret string `json:"apiSecret"` // For self-hosted Cube (HS256 JWT generation)
	CAPToken  string `json:"capToken"`  // Cloud Access Policy token for grafana-cloud mode
}

func LoadPluginSettings(source backend.DataSourceInstanceSettings) (*PluginSettings, error) {
	settings := PluginSettings{}
	err := json.Unmarshal(source.JSONData, &settings)
	if err != nil {
		return nil, fmt.Errorf("could not unmarshal PluginSettings json: %w", err)
	}

	settings.URL = source.URL
	settings.Secrets = loadSecretPluginSettings(source.DecryptedSecureJSONData)

	return &settings, nil
}

func loadSecretPluginSettings(source map[string]string) *SecretPluginSettings {
	return &SecretPluginSettings{
		ApiKey:    source["apiKey"],
		ApiSecret: source["apiSecret"],
		CAPToken:  source["capToken"],
	}
}
