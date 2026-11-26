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
| Dispatch policies | Ordered from simplest to most complex: naive first-available dispatch, independent acceptance, self-selection with an efficiency bonus, and traffic-aware courier choice | `static/simulation-engine.js` |
| Operating conditions | Normal, rush, shortage, and downtown presets; demand and fleet controls | `static/simulator.html`, `static/app.js` |
| Reproducibility | Seeded linear-congruential random number generator; benchmark replays each policy with the same seed and controls | `static/simulation-engine.js`, `static/app.js` |
| Traffic | Seeded random congestion bursts per street segment; nonlinear speed penalty, with traffic-aware routes using the same cost as courier movement | `static/app.js`, `static/dispatch-logic.js`, `static/simulation-engine.js` |
| Telemetry | Delivered, queued, weighted route cost, service level, average pickup time, pickup ETA, P95 delivery time, and fleet utilization | `static/simulator.html`, `static/app.js`, `static/metrics.js` |
| Experiments | Record a run or benchmark all policies; compare delivery, time, distance, fleet throughput, and rating | `static/app.js` |
| Service/API | Spring Boot serves static resources, exposes health, and stores experiment results through a validated API | `api/HealthController.java`, `api/experiment/ExperimentController.java` |
| Packaging | Maven build and Docker Compose launcher | `pom.xml`, `Dockerfile`, `docker-compose.yml`, `run.bat` |

## Architecture and data flow

The browser renders the simulation, but deterministic state transitions live in
`simulation-engine.js`. The engine owns request generation, assignment, courier
movement, traffic, completion state, and experiment replay. `app.js` owns
controls, Canvas rendering, and DOM updates. The separate `dispatch-logic.js`
module owns graph construction, edge lookup, congestion weights, and
shortest-path calculations.

Spring Boot does not currently run the simulation. It serves the files from
`src/main/resources/static`, provides a health endpoint, and accepts experiment
results through `POST /api/experiments`. Experiment results are persisted in
PostgreSQL by the JDBC implementation behind `ExperimentRepository`; tests use
an isolated H2 database. Run comparisons are synchronous in the browser; the comparison runner
pre-generates one request event stream and replays it for every policy before
saving the results through the API.

## Policy definitions

- **Naive: first available courier:** assigns the next request to the first idle
  courier and follows a seeded random route without considering traffic.
- **Baseline: nearest:** assigns queued requests in arrival order to the idle
  courier with the fewest street edges to pickup.
- **Self-selection + bonus:** models couriers choosing the request with the
  best local payoff from a priority-weighted incentive minus a blended pickup
  cost. Traffic-aware route costs are weighted twice as heavily as the
  distance-only baseline, so couriers respond strongly to congestion while
  retaining agency. Couriers decide after 10 seconds, versus 20 seconds for
  independent acceptance; centralized traffic-aware dispatch assigns
  immediately.
- **Independent acceptance:** keeps the nearest-courier assignment, but models
  each courier accepting individually after a brief 20-second decision delay.
  This is the simpler autonomous baseline.
- **Traffic-aware dispatch:** greedily matches idle couriers and queued requests
  by the lowest current travel-time route to pickup. It plans both pickup and
  delivery routes against current edge traffic.

Couriers accept one request at a time. All strategies use the same seeded
request stream in a benchmark, but their traffic and courier positions may
diverge as the simulation proceeds.

Traffic targets are randomized per undirected street every 24 simulated
seconds, then ease toward the new congestion over 8 seconds. The traffic random
stream is seeded independently from request and route randomness, so all
strategies in a comparison encounter the same traffic pattern. Effective
traffic is capped at 3.5; its 1.6-power speed penalty makes severe congestion
many times slower than clear roads while keeping deliveries possible.

## Metric definitions

- **Delivered:** requests completed by a courier.
- **Waiting:** requests not yet assigned. Requests already assigned are excluded.
- **Pending in run results:** all requests not yet delivered, including requests
  already assigned to a courier.
- **Average distance:** completed route cost on the pickup-plus-delivery route,
  divided by completed deliveries. Incomplete assignments are excluded.
- **Planned average distance:** assigned route cost divided by all assigned
  requests. This is separate from completed delivery performance.
- **Average pickup time:** elapsed simulation time from assignment to pickup,
  averaged over completed deliveries.
- **Average ETA:** estimated time for couriers currently traveling to pickup,
  based on current route-edge traffic.
- **Utilization:** accumulated courier busy-time divided by total available
  courier-time, as a percentage.
- **Fleet throughput:** completed deliveries per total courier-hour in the run.
  This measures delivered output against all fleet capacity, so saturated
  strategies can still be distinguished by how many requests they complete.
- **Service level:** percentage of completed requests delivered within the
  180-second assignment-to-delivery target.
- **P95 delivery time:** 95th percentile of assignment-to-delivery time for
  completed requests.
- **Courier rating:** score based on assignment-to-delivery time. Finishing
  within the service target changes the score by at most 0.25 points; every
  additional service-target interval late costs 2 points, down to a minimum
  of 1. This keeps efficiency rewards modest while making delays decisive.
- In comparison results, green, amber, and red identify the best, middle, and
  worst relative value for each metric; they describe the current benchmark,
  not an absolute industry target.
- **Benchmark pressure:** the default medium workload generates 80 requests
  over 3,600 simulated seconds (60 minutes). Courier movement uses a calibrated base speed
  before traffic weighting, so finite fleet capacity creates a visible backlog
  instead of allowing every policy to deliver every request.

## Known limitations and next engineering steps

1. The simulator remains client-side, while saved experiment results are
   persisted server-side. There is still no authentication or ownership model.
2. Self-selection models a simple configurable incentive scheme; real
   deployments would need driver preferences, marketplace constraints, and
   calibration against observed acceptance behavior.
3. The simulation uses a simplified fixed 180-second service target; scenario-
   specific SLAs and configurable vehicle speeds are future improvements.
4. Scenario controls describe a simplified model: rush hour raises demand,
   shortage reduces fleet size, and downtown raises traffic. They do not model
   weather, road closures, vehicle types, or shift schedules.
5. The benchmark runs synchronously in the browser and may block interaction
   on slower devices. A worker or incremental benchmark would scale better.
6. The browser simulation is still client-side; only graph, policy-ordering,
   and metric calculations are covered by focused JavaScript tests.

## Suggested project extension plan

1. Add authentication and ownership controls before exposing saved experiments
   to multiple users.
2. Add architecture and sequence diagrams, API contract examples, and a
   reproducible experiment protocol to the documentation.
3. Add database migrations, API rate limiting, and production secret storage
   before operating the service as a shared public backend.
