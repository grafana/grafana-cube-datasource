package plugin

import (
	"encoding/json"
	"testing"
)

func TestCubeFormatToGrafanaUnit(t *testing.T) {
	tests := []struct {
		name     string
		format   string
		currency string
		want     string
	}{
		// No format / no currency -> no unit.
		{"empty", "", "", ""},

		// Currency code alone is enough to render as currency.
		{"currency code only USD", "", "USD", "currencyUSD"},
		{"currency code only NZD", "", "NZD", "currency:NZD"},

		// Percent formats (Cube's percent values are unit fractions, 0–1).
		{"percent", "percent", "", "percentunit"},
		{"percent_2", "percent_2", "", "percentunit"},
		{"percent_0", "percent_0", "", "percentunit"},

		// Built-in currencies use Grafana's dedicated units.
		{"currency default USD", "currency", "", "currencyUSD"},
		{"currency USD", "currency", "USD", "currencyUSD"},
		{"currency EUR", "currency", "EUR", "currencyEUR"},
		{"currency GBP", "currency_0", "GBP", "currencyGBP"},
		{"currency JPY", "currency_2", "JPY", "currencyJPY"},
		{"currency BRL lowercase", "currency", "brl", "currencyBRL"},
		{"currency CHF", "currency", "CHF", "currencyCHF"},
		{"currency INR", "currency", "INR", "currencyINR"},

		// Unknown ISO codes fall back to Grafana's custom-unit syntax.
		{"currency CAD fallback", "currency", "CAD", "currency:CAD"},
		{"currency AUD fallback", "currency_2", "AUD", "currency:AUD"},
		{"currency NZD trim", "currency", "  nzd  ", "currency:NZD"},

		// Accounting is currency only when a currency code is provided.
		{"accounting no currency", "accounting", "", ""},
		{"accounting EUR", "accounting_2", "EUR", "currencyEUR"},

		// SI abbreviation maps to Grafana short.
		{"abbr", "abbr", "", "short"},
		{"abbr_1", "abbr_1", "", "short"},

		// Plain numeric formats have no unit.
		{"number", "number", "", ""},
		{"number_2", "number_2", "", ""},
		{"decimal", "decimal", "", ""},
		{"id", "id", "", ""},

		// Custom d3-format specifiers.
		{"d3 percent", ".0%", "", "percentunit"},
		{"d3 dollar USD", "$,.2f", "USD", "currencyUSD"},
		{"d3 dollar default USD", "$,.2f", "", "currencyUSD"},
		{"d3 dollar EUR", "$,.2f", "EUR", "currencyEUR"},
		{"d3 specifier with currency only", ".2f", "GBP", "currencyGBP"},
		{"d3 specifier without hints", ".2f", "", ""},
		{"unknown format", "custom", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cubeFormatToGrafanaUnit(tt.format, tt.currency)
			if got != tt.want {
				t.Errorf("cubeFormatToGrafanaUnit(%q, %q) = %q, want %q", tt.format, tt.currency, got, tt.want)
			}
		})
	}
}

func TestCubeFormatBaseNamePreservesNonNumericSuffix(t *testing.T) {
	if got := cubeFormatBaseName("currency_X"); got != "currency_X" {
		t.Errorf("cubeFormatBaseName(currency_X) = %q, want %q", got, "currency_X")
	}
	if got := cubeFormatBaseName("currency_10"); got != "currency_10" {
		t.Errorf("cubeFormatBaseName(currency_10) = %q, want %q", got, "currency_10")
	}
}

func TestCubeFormatUnmarshalJSON(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{"string format", `"currency"`, "currency"},
		{"object alias", `{"type":"custom-numeric","value":",.0f","alias":"number_0"}`, "number_0"},
		{"object value only", `{"type":"custom-numeric","value":",.2f"}`, ",.2f"},
		{"null", `null`, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var f CubeFormat
			if err := json.Unmarshal([]byte(tt.raw), &f); err != nil {
				t.Fatalf("UnmarshalJSON() error = %v", err)
			}
			if f.String() != tt.want {
				t.Errorf("got %q, want %q", f.String(), tt.want)
			}
		})
	}
}

func TestCubeMetaResponseUnmarshalObjectFormat(t *testing.T) {
	raw := `{
		"cubes": [{
			"name": "orders_view",
			"type": "view",
			"measures": [{
				"name": "orders.count",
				"title": "Count",
				"type": "number",
				"format": {"type":"custom-numeric","value":",.0f","alias":"number_0"}
			}]
		}]
	}`

	var meta CubeMetaResponse
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(meta.Cubes) != 1 || len(meta.Cubes[0].Measures) != 1 {
		t.Fatalf("unexpected meta shape: %+v", meta)
	}
	if got := meta.Cubes[0].Measures[0].Format.String(); got != "number_0" {
		t.Errorf("Format = %q, want number_0", got)
	}
}
