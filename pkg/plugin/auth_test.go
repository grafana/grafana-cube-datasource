package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestStackID_FallsBackToNamespace(t *testing.T) {
	t.Setenv("GF_ENVIRONMENT_STACK_ID", "")

	tests := []struct {
		name      string
		namespace string
		want      int64
	}{
		{"cloud stack", "stacks-42", 42},
		{"on-prem org", "org-7", 7},
		{"default org", "default", 1},
		{"unparseable", "", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pCtx := backend.PluginContext{Namespace: tt.namespace}
			if got := stackID(pCtx); got != tt.want {
				t.Errorf("namespace %q: expected %d, got %d", tt.namespace, tt.want, got)
			}
		})
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
