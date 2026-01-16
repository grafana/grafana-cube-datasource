# Changelog

## 3.0.0 (Unreleased)

### Breaking Changes

- **Flattened query structure**: The query format has changed from a nested JSON string to a flat structure with `dimensions` and `measures` as top-level fields. This is a breaking change that affects all saved dashboards and alerts.

  **Before (old format):**
  ```json
  {
    "queryText": "{\"dimensions\":[\"orders.status\"],\"measures\":[\"orders.count\"]}"
  }
  ```

  **After (new format):**
  ```json
  {
    "dimensions": ["orders.status"],
    "measures": ["orders.count"]
  }
  ```

### Migration Guide

If you have existing dashboards or alerts using this datasource, you'll need to update the query structure:

1. Export your dashboard JSON
2. For each target using this datasource, replace:
   - Remove `"queryText": "{...}"` (the JSON string)
   - Add `"dimensions": [...]` and `"measures": [...]` as top-level fields
   - If you had `limit` or `filters` in the JSON string, move them to top-level fields as well
3. Re-import the dashboard

Example transformation:
```json
// Before
{
  "queryText": "{\"dimensions\":[\"orders.status\"],\"measures\":[\"orders.count\"],\"limit\":100}"
}

// After
{
  "dimensions": ["orders.status"],
  "measures": ["orders.count"],
  "limit": 100
}
```

Initial release.
