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
| Dispatch policies | First-available naive dispatch, independent acceptance, self-selection with an efficiency bonus, and traffic-aware courier choice | `static/simulation-engine.js` |
| Operating conditions | Normal, rush, shortage, and downtown presets; demand and fleet controls | `static/simulator.html`, `static/app.js` |
| Reproducibility | Seeded linear-congruential random number generator; benchmark replays each policy with the same seed and controls | `static/simulation-engine.js`, `static/app.js` |
| Traffic | Time-varying traffic on street edges; downtown applies a stronger traffic factor | `static/app.js`, `static/dispatch-logic.js` |
| Telemetry | Delivered, queued, weighted route cost, service level, average pickup time, pickup ETA, P95 delivery time, and fleet utilization | `static/simulator.html`, `static/app.js`, `static/metrics.js` |
| Experiments | Record a run or benchmark all policies; compare delivery, time, distance, utilization, and rating | `static/app.js` |
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

- **Baseline: nearest:** assigns queued requests in arrival order to the idle
  courier with the fewest street edges to pickup.
- **Self-selection + bonus:** models couriers choosing the request with the
  best local payoff from a priority-weighted incentive minus a blended pickup
  cost. The cost is 55% distance and 45% traffic-aware distance, so couriers
  retain agency while still responding to congestion. It is intentionally a
  middle ground between independent acceptance and centralized
  traffic-aware dispatch. Its 200-second acceptance delay is also intentionally
  between independent acceptance and immediate centralized dispatch.
- **Independent acceptance:** keeps the nearest-courier assignment, but models
  each courier accepting individually after the same decision delay used by
  self-selection. This is the simpler autonomous baseline.
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
- **Service level:** percentage of completed requests delivered within the
  180-second assignment-to-delivery target.
- **P95 delivery time:** 95th percentile of assignment-to-delivery time for
  completed requests.
- **Courier rating:** rolling score derived from pickup time, delivery time,
  total customer wait, on-time completion, and small coordination penalties.
  The first five minutes of total wait are tolerated; after that, the wait
  component decays exponentially, making a 30-minute delivery materially
  worse than a five-minute delivery. The result is bounded from 1 to 5.
- In comparison results, green, amber, and red identify the best, middle, and
  worst relative value for each metric; they describe the current benchmark,
  not an absolute industry target.
- **Benchmark pressure:** the default medium workload generates about 212 requests
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
