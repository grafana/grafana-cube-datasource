package plugin

import (
	"bytes"
	"encoding/json"
	"strings"
)

// CubeFormat accepts Cube meta/query format as either a string (e.g. "currency")
// or an object. Cube object formats are typed (see @cubejs-client/core types):
//   - {"type":"custom-numeric","value":",.0f","alias":"number_0"} (numeric, d3-format)
//   - {"type":"custom-time","value":"%Y-%m-%d"} (non-numeric)
//   - {"type":"link","label":"..."} (non-numeric)
//
// Only NUMERIC formats carry a Grafana-mappable unit, so non-numeric object
// formats are dropped to "" and never flow into the numeric unit mapper.
type CubeFormat string

func (f *CubeFormat) UnmarshalJSON(data []byte) error {
	// Trim surrounding JSON whitespace before dispatching on the first byte.
	data = bytes.TrimSpace(data)
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

	// Only custom-numeric formats map to a numeric unit. A typed object that is
	// not custom-numeric (e.g. custom-time, link) must not be treated as a d3
	// numeric specifier (a custom-time value like "%Y-%m-%d" would otherwise be
	// misread as a percent format). An empty type is allowed through best-effort.
	if obj.Type != "" && obj.Type != "custom-numeric" {
		*f = ""
		return nil
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
	// Trim so whitespace-only currency codes are treated as absent (avoids an
	// invalid `currency:` unit downstream).
	currency = strings.TrimSpace(currency)

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
	case "number", "decimal", "id", "":
		// Plain numeric formats have no unit. A bare currency CODE does NOT imply
		// currency formatting: Cube only sets `currency` when a currency FORMAT is
		// used, and @cubejs-client/core renders such values as plain numbers.
		return ""
	default:
		// Custom d3-format specifier: map by its explicit currency prefix / type.
		return d3SpecifierUnit(format, currency)
	}
}

// d3SpecifierUnit maps a raw d3-format specifier string to a Grafana unit,
// mirroring how @cubejs-client/core would render the value. Only specifiers
// whose type actually formats currency/percent/SI get a unit; a plain numeric
// specifier (e.g. ".2f") stays unitless even if a currency code is present.
//
// d3-format type reference: https://d3js.org/d3-format#locale_format
func d3SpecifierUnit(spec, currency string) string {
	// A '$' in the specifier requests currency rendering (e.g. "$,.2f").
	if strings.Contains(spec, "$") {
		return cubeCurrencyUnit(currency)
	}
	switch d3TypeChar(spec) {
	case '%', 'p':
		// Both '%' and 'p' are d3 percentage types (value multiplied by 100).
		return "percentunit"
	case 's':
		// SI-prefix notation -> Grafana "short".
		return "short"
	default:
		return ""
	}
}

// d3TypeChar returns the trailing d3-format type character (the last byte of the
// specifier, e.g. 'f' in ".2f", '%' in ".0%", 'p' in ".2p", 's' in ".2s").
func d3TypeChar(spec string) byte {
	if spec == "" {
		return 0
	}
	return spec[len(spec)-1]
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
