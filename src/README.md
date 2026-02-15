# Cube Datasource Plugin for Grafana

[![Marketplace](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.version&url=https://grafana.com/api/plugins/grafana-cube-datasource&label=Marketplace&prefix=v&color=F47A20)](https://grafana.com/grafana/plugins/grafana-cube-datasource/)
[![Grafana](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.grafanaDependency&url=https://grafana.com/api/plugins/grafana-cube-datasource&label=Grafana&color=F47A20)](https://grafana.com/grafana/plugins/grafana-cube-datasource/)
[![Downloads](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.downloads&url=https://grafana.com/api/plugins/grafana-cube-datasource&label=Downloads&color=F47A20)](https://grafana.com/grafana/plugins/grafana-cube-datasource/)
[![License](https://img.shields.io/github/license/grafana/grafana-cube-datasource)](LICENSE)



> **Experimental**: This plugin is experimental. Features may be incomplete or have known limitations, and you should expect some rough edges. See [Experimental Status](#experimental-status) for details.

Connect Grafana to [Cube](https://cube.dev/) for semantic layer analytics. Query measures and dimensions, apply filters, and visualize your data—without writing SQL.

![Query Editor](https://raw.githubusercontent.com/grafana/grafana-cube-datasource/main/src/img/screenshot-query-editor.png)

## Why Use This Plugin?

This plugin brings a **true semantic layer** to Grafana for the first time. By connecting to Cube, you get:

- **No more writing SQL** — Query your data using pre-defined measures and dimensions
- **No more writing JOINs** — Cube handles the complexity of joining tables for you
- **Single source of truth** — Business metrics are defined once in Cube and used consistently across all dashboards
- **Lower barrier to entry** — Non-technical users can build dashboards without SQL knowledge
- **Scalable complexity** — Start simple, but analytics queries can grow as sophisticated as you need
- **More maintainable dashboards** — Panels require far less code when using semantic definitions
- **Cross-panel filtering** — Use AdHoc filters to drill down across Table and Bar Chart panels, enabling data exploration for dashboard viewers

## Features

### Query Builder

The visual query builder supports:

| Feature | Description |
|---------|-------------|
| **Dimensions** | Select one or more dimensions to group your data |
| **Measures** | Select one or more measures to aggregate |
| **Limit** | Control the number of rows returned (defaults to 10,000; maximum 50,000). See [Cube's row limit documentation](https://cube.dev/docs/product/apis-integrations/core-data-apis/queries#row-limit) for details. |
| **Filters** | Filter your query before aggregation |
| **Order** | Sort results by any selected dimension or measure |

### Filtering

The visual query builder supports:

- **Filter members**: Dimensions only
- **Operators**: `equals` and `notEquals`, each accepting multiple values
- **Multiple filters**: Combine with AND (intersection)

#### Advanced Filtering (via Panel JSON)

The full [Cube filter syntax](https://cube.dev/docs/product/apis-integrations/rest-api/query-format#filters-format) is supported when editing queries via the panel JSON editor, including:

- **All Cube filter operators**: `contains`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet`, `inDateRange`, and more
- **Measure filters**: Filter on any measure, not just dimensions
- **AND/OR filter groups**: Combine filters with logical AND/OR for complex conditions (e.g. "status = completed OR payment_method = credit_card")

Queries using these features display in the read-only JSON viewer (see below). The visual builder includes a hint with a link to the [Cube filter docs](https://cube.dev/docs/product/apis-integrations/rest-api/query-format#filters-format) for reference.

### JSON Query Viewer

When a query uses features that the visual builder cannot represent (such as time dimensions configured in the panel JSON), the editor automatically switches to a **read-only JSON viewer**. This shows:

- An info banner explaining which features triggered JSON mode
- The full query as syntax-highlighted JSON
- A compiled SQL preview

This ensures no query configuration is hidden — users always see exactly what is configured, even for advanced queries. To edit these queries, use the **dashboard JSON editor** or **panel JSON editor**.

### Dashboard Variables

#### AdHoc Filters

Clicking a value in a **Table** or **Bar Chart** panel creates or updates an AdHoc dashboard variable scoped to the Cube datasource. This enables powerful cross-panel filtering and data exploration.

AdHoc filters can also be edited directly in the dashboard UI to add additional filter members, operators, and values. The same operator limitations apply (`=` and `!=` only).

**How filters combine:**
- Multiple AdHoc filters combine with AND (intersection)
- AdHoc filters combine with per-panel filters using AND (intersection)

#### Time Range Filtering

To filter all panels by the dashboard time picker:

1. Create a dashboard variable with identifier `cubeTimeDimension`
2. Set its value to the time dimension field you want to filter by (e.g., `order_date`)
3. The dashboard's `$__from` and `$__to` variables will automatically apply to all panels

## Requirements

- Grafana 12.2.5 or later
- A running Cube instance (self-hosted*)

*See [Known Limitations](#known-limitations) regarding using Cube Cloud.

## Getting Started

1. Install the plugin from the Grafana plugin catalog
2. Go to **Connections** → **Data sources** → **Add data source**
3. Search for "Cube" and select it
4. Configure the connection:
   - **URL**: Your Cube REST API endpoint (e.g., `http://localhost:4000`)
   - **Deployment Type**: Select your Cube deployment type (self-hosted or self-hosted-dev)*
   - **API Secret**: Your Cube API secret (if authentication is enabled)
   - **SQL Datasource**: Select the SQL datasource to open when clicking "Edit SQL in Explore"
5. Click **Save & test** to verify the connection

*See [Known Limitations](#known-limitations) regarding using Cube Cloud.

## Known Limitations

This plugin is experimental. Current limitations include:

| Limitation | Details |
|------------|---------|
| **Cube Cloud authentication** | Authentication does not yet work with Cube Cloud. Self-hosted Cube (dev and production mode) works correctly. |
| **Technical field names** | Dimension and measure names currently use full technical identifiers (e.g., `orders.customer_name`) rather than human-readable labels. This is due to a dependency on how Grafana implements AdHoc filters. |
| **Visual builder filter operators** | The visual builder only supports `equals` and `notEquals`. All Cube operators are available via panel JSON. |
| **Visual builder filter members** | The visual builder only supports dimension filters. Measure filters are available via panel JSON. |
| **Cross-panel filtering** | Depends on Grafana AdHoc filters. Currently works with Table and Bar Chart panels only |

## Experimental Status

> **Not for production use.** This plugin is experimental and is not meant to be used in production or critical environments.

This plugin is marked as **experimental**, meaning:

- Features may be incomplete or have known limitations
- Backward compatibility is not guaranteed between versions
- The data model, configuration, or UI might change, potentially breaking dashboards
- The risks are unknown and potentially high
- Support is limited to GitHub issues; no SLA is provided

**Do not use this plugin in production environments.** It is intended for:
- Testing and evaluation
- Development environments
- Providing early feedback
- Validating use cases before production readiness

Track the [changelog](https://github.com/grafana/grafana-cube-datasource/blob/main/CHANGELOG.md) for breaking changes and stability updates.

## Documentation

- [Cube Documentation](https://cube.dev/docs)
- [GitHub Repository](https://github.com/grafana/grafana-cube-datasource)

## Contributing

We welcome contributions and feedback! Please open issues or pull requests on the [GitHub repository](https://github.com/grafana/grafana-cube-datasource).
