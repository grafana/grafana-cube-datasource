package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

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
		backend.Logger.Error("Failed to fetch data from Cube API", "error", err, "url", u.String())
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
