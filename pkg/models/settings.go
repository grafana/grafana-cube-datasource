package models

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type PluginSettings struct {
	CubeApiUrl              string                `json:"cubeApiUrl"`
	DeploymentType          string                `json:"deploymentType"` // "cloud", "self-hosted", or "self-hosted-dev"
	ExploreSqlDatasourceUid string                `json:"exploreSqlDatasourceUid"`
	Secrets                 *SecretPluginSettings `json:"-"`
}

type SecretPluginSettings struct {
	ApiKey    string `json:"apiKey"`    // For Cube Cloud
	ApiSecret string `json:"apiSecret"` // For self-hosted Cube (JWT generation)
}

func LoadPluginSettings(source backend.DataSourceInstanceSettings) (*PluginSettings, error) {
	settings := PluginSettings{}
	err := json.Unmarshal(source.JSONData, &settings)
	if err != nil {
		return nil, fmt.Errorf("could not unmarshal PluginSettings json: %w", err)
	}

	settings.Secrets = loadSecretPluginSettings(source.DecryptedSecureJSONData)

	return &settings, nil
}

func loadSecretPluginSettings(source map[string]string) *SecretPluginSettings {
	return &SecretPluginSettings{
		ApiKey:    source["apiKey"],
		ApiSecret: source["apiSecret"],
	}
}
