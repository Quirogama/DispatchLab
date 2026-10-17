# DispatchLab project guide

## Purpose

DispatchLab is a browser-based urban delivery simulation. It is designed as a
small systems engineering project: routing, dispatch policies, stochastic
demand, traffic, fleet state, telemetry, repeatable experiments, and a Java
service wrapper are represented in one runnable application.

## Feature inventory

| Area | Current behavior | Main implementation |
| --- | --- | --- |
| Overview and navigation | Landing page links to the city simulator; simulator links back | `static/index.html`, `static/simulator.html` |
| Street network | Configurable rectangular grid graph with congestion-weighted shortest paths | `static/dispatch-logic.js` |
| Delivery requests | Random arrival, random destination, random priority, and map-click creation | `static/app.js` |
| Courier fleet | Couriers start at four depots and move through pickup and delivery states | `static/app.js` |
| Dispatch policies | Nearest, priority-first queue, balanced completed workload, and traffic-aware courier choice | `static/app.js` |
| Operating conditions | Normal, rush, shortage, and downtown presets; demand and fleet controls | `static/simulator.html`, `static/app.js` |
| Reproducibility | Seeded linear-congruential random number generator; benchmark replays each policy with the same seed and controls | `static/app.js` |
| Traffic | Time-varying traffic on street edges; downtown applies a stronger traffic factor | `static/app.js`, `static/dispatch-logic.js` |
| Telemetry | Delivered, queued, average route blocks, estimated efficiency, average pickup time, and pickup ETA | `static/simulator.html`, `static/app.js` |
| Fleet roster | Current status, completed deliveries, and rolling courier rating | `static/app.js` |
| Experiments | Record a run or benchmark all policies; compare delivery, time, distance, utilization, and rating | `static/app.js` |
| Service/API | Spring Boot serves static resources and exposes `GET /api/health` | `api/HealthController.java` |
| Packaging | Maven build and Docker Compose launcher | `pom.xml`, `Dockerfile`, `docker-compose.yml`, `run.bat` |

## Architecture and data flow

The browser owns the simulation state. `app.js` creates the graph and seeded
random generator, creates requests, assigns idle couriers, advances the clock,
updates traffic, renders the canvas, and refreshes the telemetry. The separate
`dispatch-logic.js` module owns graph construction, edge lookup, congestion
weights, nearest-node selection, and shortest-path calculations.

Spring Boot does not currently run the simulation or persist data. It serves
the files from `src/main/resources/static` and provides a health endpoint. Run
comparisons are synchronous and remain in browser memory; refreshing the page
clears the run history.

## Policy definitions

- **Baseline: nearest:** assigns queued requests in arrival order to the idle
  courier with the fewest street edges to pickup.
- **Priority first:** orders queued requests by descending priority, then uses
  the same nearest-courier selection. Equal priorities retain arrival order.
- **Balanced workload:** processes requests in arrival order and, among idle
  couriers, prefers the courier with fewer completed deliveries, then breaks
  ties by street distance to pickup.
- **Traffic-aware dispatch:** assigns queued requests in arrival order to the
  idle courier with the lowest current traffic-weighted route cost to pickup.

Couriers accept one request at a time. All strategies use the same seeded
request stream in a benchmark, but their traffic and courier positions may
diverge as the simulation proceeds.

## Metric definitions

- **Delivered:** requests completed by a courier.
- **Waiting:** requests not yet assigned. Requests already assigned are excluded.
- **Pending in run results:** all requests not yet delivered, including requests
  already assigned to a courier.
- **Average distance:** congestion-weighted route cost on the pickup-plus-delivery
  route selected when the courier receives the request, divided by completed
  deliveries. It is reported in weighted blocks.
- **Average pickup time:** elapsed simulation time from assignment to pickup,
  averaged over completed deliveries.
- **Average ETA:** estimated time for couriers currently traveling to pickup,
  based on current route-edge traffic.
- **Utilization:** accumulated courier busy-time divided by total available
  courier-time, as a percentage.
- **Efficiency:** currently a simple queue-based indicator (`100 - 4 × waiting`,
  floored at zero). It is a heuristic, not a standard operations metric.
- **Courier rating:** rolling score derived from pickup and delivery times,
  bounded from 3 to 5 by the current scoring formula.

## Known limitations and next engineering steps

1. The simulator and run history are client-side only; there is no persistence,
   user management, or server-side experiment API.
2. The balanced policy considers completed deliveries, but not a richer measure
   such as cumulative workload, fairness, or courier availability history.
3. Efficiency is a placeholder heuristic and should be renamed or replaced by
   an explicitly defined service-level metric.
4. Scenario controls describe a simplified model: rush hour raises demand,
   shortage reduces fleet size, and downtown raises traffic. They do not model
   weather, road closures, vehicle types, or shift schedules.
5. The benchmark runs synchronously in the browser and may block interaction
   on slower devices. A worker or incremental benchmark would scale better.
6. The codebase has only a small graph-logic test and a Spring context-load
   test. Dispatch assignment, seeded reproducibility, metric calculations,
   scenarios, and API behavior need focused tests.

## Suggested project extension plan

1. Add JavaScript unit tests for dispatch policies, seeded demand, routes, and
   metric calculations; fix the existing graph test expectations to match the
   configured graph dimensions.
2. Extract simulation state transitions and metric aggregation from DOM code
   into testable modules.
3. Define benchmark inputs and output schemas, then export experiment results
   as JSON or CSV.
4. Add server-side experiment persistence and API validation if multi-user or
   long-lived runs become project requirements.
5. Add architecture and sequence diagrams, API contract examples, and a
   reproducible experiment protocol to the documentation.
