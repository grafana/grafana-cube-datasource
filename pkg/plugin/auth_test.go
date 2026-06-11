package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestStackID_FallsBackToOrgID(t *testing.T) {
	t.Setenv("GF_ENVIRONMENT_STACK_ID", "")
	pCtx := backend.PluginContext{OrgID: 7}
	if got := stackID(pCtx); got != 7 {
		t.Errorf("expected OrgID 7 as fallback, got %d", got)
	}
}

func TestGenerateNonce_Unique(t *testing.T) {
	n1, err := generateNonce()
	if err != nil || n1 == "" {
		t.Fatalf("generateNonce() failed: %v", err)
	}
	n2, _ := generateNonce()
	if n1 == n2 {
		t.Error("expected nonces to be unique")
	}
}
