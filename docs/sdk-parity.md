# Cube SDK Parity Policy

This datasource backend is written in Go, but the authoritative definition of
Cube's client/protocol behavior lives in the official JavaScript SDK
(`@cubejs-client/core`) and the Cube REST API (`@cubejs-api-gateway`). To avoid
re-discovering protocol semantics ad hoc and drifting from Cube Playground / the
JS clients, this repository follows an explicit **SDK parity policy**.

This document is the human-facing companion to the agent-facing rule in
[`.cursor/rules/sdk-parity.mdc`](../.cursor/rules/sdk-parity.mdc) and the
contributor checklist in [`AGENTS.md`](../AGENTS.md). It tracks issue
[#118](https://github.com/grafana/grafana-cube-datasource/issues/118).

## Policy

1. **Mirror the SDK by default.** For protocol-level behavior — `/v1/load`
   continue-wait polling, GET/POST method selection, request size limits,
   cancellation vs. timeout, non-200 status/error propagation, transient
   network/502 retries, progress fields — match `@cubejs-client/core` and the
   `/cubejs-api/v1` server contract in `@cubejs-api-gateway` unless there is a
   clear Grafana/backend reason to diverge.

2. **Document intentional divergences.** When we knowingly differ from the SDK,
   record it in the [Divergence log](#divergence-log) below with:
   - **rationale** — why the divergence is necessary,
   - **user impact** — what a user observes differently, and
   - **tests** — the Go test(s) that lock in the intended behavior.

3. **State parity decisions in the PR.** Any PR that touches Cube API behavior
   must state, in its description, which SDK/server behavior it mirrors or
   intentionally diverges from, and link the relevant SDK/gateway source and
   REST docs it checked.

## Where to check behavior

Before changing anything around Cube API calls, compare against **all three**
sources of truth (the Cube monorepo is cloned alongside this repo at `../cube`):

| Source | Location |
|--------|----------|
| JS client core (query/polling/retry, `RequestError`, transport categories) | `../cube/packages/cubejs-client-core/src/index.ts`, `.../HttpTransport.ts` |
| Server contract (`/v1/load`, status codes, error shapes, continue-wait) | `../cube/packages/cubejs-api-gateway/src/gateway.ts` |
| REST API docs | `../cube/docs/content/product/apis-integrations/core-data-apis/rest-api/` (`index.mdx`, `reference.mdx`) |
| Existing plugin behavior + tests | `pkg/plugin/*.go`, `pkg/plugin/*_test.go` |

## Testing expectations

- Prefer behavior-focused tests (success / error / cancel / retry paths), not
  timing-sensitive assertions.
- Keep protocol tests deterministic and minimal (use `httptest` servers and
  injectable intervals/retry counts rather than real sleeps where possible).
- When an implementation choice is SDK-aligned or an intentional divergence,
  say so in a code comment so the next reader (human or agent) does not "fix"
  it back.

## Divergence log

Behaviors where the Go backend intentionally differs from `@cubejs-client/core`.
Everything not listed here is expected to mirror the SDK.

### How the SDK actually retries (precedence matters)

The divergences below hinge on one subtlety in `cubejs-client-core`'s
`loadMethod` (`index.ts`, ~L363). Because JavaScript `&&` binds tighter than
`||`, the retry condition parses as:

```js
(response.status === 502) || (response.error === 'network error' && --networkRetries >= 0)
```

So the SDK:

- retries **HTTP 502 unconditionally** — even when `networkErrorRetries` is `0`,
  and without ever decrementing the budget; and
- retries a transport **"network error"** only while `networkErrorRetries`
  (default `0`) has budget left.

Both wait `pollInterval` between attempts. `Continue wait` responses, by
contrast, are retried **immediately** (`continueWait()` is called with
`wait=false`); the pacing comes from the server long-poll (Cube's query queue
blocks up to `continueWaitTimeout`, default 10s, before returning `Continue
wait`). The Go backend mirrors this immediate-retry cadence — this is
SDK-aligned, **not** a divergence, so it is not listed below.

### 1. Network-error retries are enabled by default

- **SDK behavior:** the transport "network error" retry is gated by
  `networkErrorRetries`, which defaults to `0` (opt-in).
- **Divergence:** the backend enables a small bounded number of network-error
  retries by default (`defaultNetworkErrorRetries` in
  `pkg/plugin/cubeclient.go`) with short exponential backoff.
- **Rationale:** a Grafana backend datasource has no application layer above it
  to opt into `networkErrorRetries`, and dashboards issue many concurrent
  queries. Transparently surviving brief upstream blips (load-balancer
  restarts) beats surfacing a hard error to every panel.
- **User impact:** a query that hits a transient network error is retried a few
  times before failing. Operators can restore SDK-exact behavior (or tune it)
  via the `networkErrorRetries` datasource jsonData setting — `0` disables
  retries entirely, matching the SDK default.
- **Tests:** `TestDoCubeLoadRequestRetriesOnNetworkError`,
  `TestDoCubeLoadRequestNetworkErrorRetriesDisabled`,
  `TestNetworkErrorRetriesResolution`, `TestDoCubeLoadRequestTimeoutNotRetried`
  in `pkg/plugin/cubeclient_retry_test.go`.

### 2. HTTP 502 retries are bounded (not unconditional)

- **SDK behavior:** retries `502` **unconditionally / unbounded** (a side effect
  of the `&&`/`||` precedence above), which can loop forever against a
  permanently-502 upstream.
- **Divergence:** the backend retries `502` too, but caps it with the same
  bounded budget as network-error retries.
- **Rationale:** an unbounded retry loop is undesirable in a backend; a
  persistently failing gateway should surface as an error (with the upstream
  `502` status + body preserved) rather than hang.
- **User impact:** transient `502`s are retried and usually succeed; a sustained
  `502` fails after the budget with the upstream status/body preserved.
- **Tests:** `TestDoCubeLoadRequestRetriesOn502`,
  `TestDoCubeLoadRequestExhaustsRetriesReturns502`,
  `TestDoCubeLoadRequestDoesNotRetryNonRetryableStatus`,
  `TestDoCubeLoadRequestCancelledDuring502Backoff` in
  `pkg/plugin/cubeclient_retry_test.go`.

### 3. Continue-wait progress is not surfaced as a live progress stream

- **SDK behavior:** exposes a `progressCallback(ProgressResult)` invoked on each
  `Continue wait` message so an app can render live `stage` / `timeElapsed`.
- **Divergence:** the backend parses `stage` / `timeElapsed` and uses them for
  server-side logs and to enrich timeout/cancel error messages, but does not
  push a live progress stream to the frontend.
- **Rationale:** Grafana's `QueryData` is a single request/response; there is no
  general progress channel for the panel query path, so a live callback has no
  destination. The parsed progress is still the most useful thing we can do with
  it (operator logs + actionable error context).
- **User impact:** users do not see a live "stage: Executing query" indicator,
  but a query that times out or is cancelled includes the last known stage and
  Cube `timeElapsed` in its error message.
- **Tests:** `TestQueryDataContinueWaitCancelledIncludesElapsedTime`,
  `TestQueryDataHTTPTimeoutWrapped` in `pkg/plugin/query_test.go`.

### 4. Subscribe / continuous-fetch mode is not implemented

- **SDK behavior:** supports `subscribe` for continuous polling and a WebSocket
  transport.
- **Divergence:** the backend query path is poll-until-ready only (continue-wait),
  then returns once.
- **Rationale:** Grafana panels re-query on their own refresh interval; a
  persistent subscribe/WebSocket loop in the backend is out of scope and would
  duplicate Grafana's refresh mechanism.
- **User impact:** none for standard dashboards; real-time streaming panels are
  not supported by this datasource.
