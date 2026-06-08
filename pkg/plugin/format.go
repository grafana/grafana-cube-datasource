package plugin

import (
	"encoding/json"
	"strings"
)

// CubeFormat accepts Cube meta/query format as either a string (e.g. "currency")
// or an object (e.g. {"type":"custom-numeric","value":",.0f","alias":"number_0"}).
type CubeFormat string

func (f *CubeFormat) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*f = ""
		return nil
	}

	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		*f = CubeFormat(s)
		return nil
	}

	var obj struct {
		Type  string `json:"type"`
		Value string `json:"value"`
		Alias string `json:"alias"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return err
	}

	switch {
	case obj.Alias != "":
		*f = CubeFormat(obj.Alias)
	case obj.Value != "":
		*f = CubeFormat(obj.Value)
	default:
		*f = ""
	}
	return nil
}

func (f CubeFormat) String() string {
	return string(f)
}

// cubeFormatToGrafanaUnit maps Cube measure/dimension format values to Grafana field units.
//
// Cube format docs:   https://docs.cube.dev/reference/data-modeling/measures#format
// Grafana units list: https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/valueFormats/categories.ts
//
// Cube named formats accept an optional "_N" suffix (0–6) for decimal precision
// (e.g. "currency_2"). Custom d3-format specifier strings are also supported
// (e.g. "$,.2f", ".0%").
func cubeFormatToGrafanaUnit(format, currency string) string {
	if format == "" {
		// A currency code without a format still implies a currency value.
		if currency != "" {
			return cubeCurrencyUnit(currency)
		}
		return ""
	}

	switch cubeFormatBaseName(format) {
	case "percent":
		// Cube percent formats display 0.125 as 12.5%, matching Grafana's
		// percentunit (Percent 0.0-1.0) rather than percent (0-100).
		return "percentunit"
	case "currency":
		return cubeCurrencyUnit(currency)
	case "accounting":
		// Accounting is "parentheses for negatives". When paired with a
		// currency code, treat as currency; otherwise leave unset.
		if currency != "" {
			return cubeCurrencyUnit(currency)
		}
		return ""
	case "abbr":
		// SI prefix (K, M, G, …) -> Grafana "short" (K, Mil, Bil, …).
		return "short"
	case "number", "decimal", "id":
		return ""
	default:
		// Custom d3-format specifiers.
		if strings.Contains(format, "%") {
			return "percentunit"
		}
		if strings.Contains(format, "$") || currency != "" {
			return cubeCurrencyUnit(currency)
		}
		return ""
	}
}

// cubeFormatBaseName strips the optional "_N" precision suffix (N is 0–6).
func cubeFormatBaseName(format string) string {
	if idx := strings.LastIndex(format, "_"); idx > 0 {
		suffix := format[idx+1:]
		if len(suffix) == 1 && suffix[0] >= '0' && suffix[0] <= '6' {
			return format[:idx]
		}
	}
	return format
}

// grafanaBuiltInCurrencyUnits lists the ISO 4217 codes that Grafana ships
// dedicated currencyXXX value formats for. Using these yields proper symbols
// and locale-aware rendering. Codes not in this map fall back to the generic
// `currency:XXX` custom-unit syntax.
//
// Source: packages/grafana-data/src/valueFormats/categories.ts
var grafanaBuiltInCurrencyUnits = map[string]string{
	"USD": "currencyUSD",
	"GBP": "currencyGBP",
	"EUR": "currencyEUR",
	"JPY": "currencyJPY",
	"RUB": "currencyRUB",
	"UAH": "currencyUAH",
	"BRL": "currencyBRL",
	"DKK": "currencyDKK",
	"ISK": "currencyISK",
	"NOK": "currencyNOK",
	"SEK": "currencySEK",
	"CZK": "currencyCZK",
	"CHF": "currencyCHF",
	"PLN": "currencyPLN",
	"BTC": "currencyBTC",
	"ZAR": "currencyZAR",
	"INR": "currencyINR",
	"KRW": "currencyKRW",
	"IDR": "currencyIDR",
	"PHP": "currencyPHP",
	"VND": "currencyVND",
	"TRY": "currencyTRY",
	"MYR": "currencyMYR",
	"XPF": "currencyXPF",
	"BGN": "currencyBGN",
	"PYG": "currencyPYG",
	"UYU": "currencyUYU",
	"ILS": "currencyILS",
}

// cubeCurrencyUnit maps an ISO 4217 currency code to the best matching
// Grafana unit. Falls back to Grafana's custom `currency:XXX` syntax for
// codes without a dedicated built-in format, and to currencyUSD when no
// currency was provided (USD is Grafana's conventional default).
func cubeCurrencyUnit(currency string) string {
	if currency == "" {
		return "currencyUSD"
	}
	code := strings.ToUpper(strings.TrimSpace(currency))
	if unit, ok := grafanaBuiltInCurrencyUnits[code]; ok {
		return unit
	}
	return "currency:" + code
}

func fieldInfoUnit(info CubeFieldInfo) string {
	return cubeFormatToGrafanaUnit(info.Format.String(), info.Currency)
}
