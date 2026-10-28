import { nearestNode, getEffectiveTraffic, getEdge } from './dispatch-logic.js';
import { calculateMetrics, summarizeRun } from './metrics.js';
import {
    addSimulationRequest,
    advanceSimulation,
    createSimulationState,
    runExperiment,
    travelTime
} from './simulation-engine.js';

const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const algorithmInput = document.querySelector('#algorithm');
const demandInput = document.querySelector('#demand');
const courierInput = document.querySelector('#courierCount');
const playButton = document.querySelector('#playButton');
const resetButton = document.querySelector('#resetButton');
const exportJsonButton = document.querySelector('#exportJsonButton');
const exportCsvButton = document.querySelector('#exportCsvButton');
const runState = document.querySelector('#runState');
const statusLine = document.querySelector('#statusLine');
const algorithmNote = document.querySelector('#algorithmNote');
const grid = { columns: 15, rows: 6 };
const canvasRatio = 5.25 / grid.columns;
const depots = [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 2, y: 4 }, { x: 12, y: 4 }];
const requestColors = ['#e5684c', '#f09b52', '#c94f59'];
const courierNames = ['Maya', 'Leo', 'Nora', 'Sam', 'Iris', 'Alex', 'Zoe', 'Noah', 'Lina', 'Kai'];
const algorithmNotes = {
    nearest: 'Minimizes street distance from courier to pickup.',
    priority: 'Serves urgent requests before optimizing travel distance.',
    balanced: 'Spreads work across the fleet to avoid overload.',
    traffic: 'Chooses the courier with the fastest route through current traffic.'
};
let state;
let lastFrame = 0;
let animationFrame;
const experimentResults = [];
let benchmarkMode = false;

function createState() {
    const courierCount = Number(courierInput.value);
    const seed = Number(document.querySelector('#seed').value) || 90210;
    return createSimulationState({
        grid,
        depots,
        courierCount,
        courierNames,
        seed,
        algorithm: algorithmInput.value,
        demandDelay: demandDelay()
    });
}

function demandDelay() { return [2.8, 1.7, 0.85][Number(demandInput.value) - 1]; }

function addRequest(station, destination) {
    addSimulationRequest(state, station, destination);
    if (!benchmarkMode) statusLine.textContent = 'New delivery request added to the queue.';
    if (!benchmarkMode) draw();
}

function update(delta) {
    advanceSimulation(state, delta);
    if (!benchmarkMode) updateMetrics();
}

function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = bounds.width * ratio;
    canvas.height = bounds.width * canvasRatio * ratio;
    canvas.style.height = `${bounds.width * canvasRatio}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
}

function point(station, width, height) {
    return { x: (station.x + 0.5) * width / grid.columns, y: (station.y + 0.5) * height / grid.rows };
}

function edgeTrafficColor(congestion) {
    if (congestion >= 1.2) return '#d96c4d';
    if (congestion >= 0.7) return '#e7b75d';
    return '#8ab7b0';
}

function drawStreetNetwork(width, height) {
    context.fillStyle = '#edf2ee';
    context.fillRect(0, 0, width, height);

    const seen = new Set();
    state.graph.nodes.forEach(node => {
        const key = `${node.x},${node.y}`;
        (state.graph.adjacency.get(key) ?? []).forEach(neighbor => {
            const edgeKey = [key, `${neighbor.x},${neighbor.y}`].sort().join('|');
            if (seen.has(edgeKey)) return;
            seen.add(edgeKey);

            const start = point(node, width, height);
            const end = point(neighbor, width, height);
            const congestion = getEffectiveTraffic(neighbor);

            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.strokeStyle = edgeTrafficColor(congestion);
            context.lineWidth = 1.2 + congestion * 2.2;
            context.globalAlpha = 0.8;
            context.stroke();
        });
    });

    context.globalAlpha = 1;
    context.fillStyle = '#edf3f1';
    context.strokeStyle = '#7ea09b';
    context.lineWidth = 1.1;
    state.graph.nodes.forEach(node => {
        const pointOnMap = point(node, width, height);
        context.beginPath();
        context.arc(pointOnMap.x, pointOnMap.y, 4.2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });
}

function draw() {
    const width = canvas.clientWidth;
    const height = width * canvasRatio;
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    drawStreetNetwork(width, height);

    depots.forEach(depot => {
        const depotPoint = point(depot, width, height);
        context.fillStyle = '#168b83';
        context.beginPath();
        context.moveTo(depotPoint.x, depotPoint.y - 12);
        context.lineTo(depotPoint.x + 12, depotPoint.y);
        context.lineTo(depotPoint.x, depotPoint.y + 12);
        context.lineTo(depotPoint.x - 12, depotPoint.y);
        context.closePath();
        context.fill();
        context.fillStyle = '#fffdf8';
        context.beginPath();
        context.moveTo(depotPoint.x, depotPoint.y - 4);
        context.lineTo(depotPoint.x + 4, depotPoint.y);
        context.lineTo(depotPoint.x, depotPoint.y + 4);
        context.lineTo(depotPoint.x - 4, depotPoint.y);
        context.closePath();
        context.fill();
    });

    state.requests.forEach(request => {
        const pickup = point(request.pickup, width, height);
        const destination = point(request.destination, width, height);
        context.strokeStyle = request.color;
        context.globalAlpha = 0.7;
        context.setLineDash([5, 6]);
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(pickup.x, pickup.y);
        context.lineTo(destination.x, destination.y);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;

        context.fillStyle = request.color;
        context.beginPath();
        context.arc(pickup.x, pickup.y, 10, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#fffdf8';
        context.beginPath();
        context.moveTo(destination.x, destination.y - 8);
        context.lineTo(destination.x + 8, destination.y + 6);
        context.lineTo(destination.x - 8, destination.y + 6);
        context.closePath();
        context.fill();
        context.strokeStyle = request.color;
        context.lineWidth = 2;
        context.stroke();
    });

    state.couriers.forEach(courier => {
        const courierPoint = point(courier, width, height);
        const size = 12;

        const currentNode = { x: Math.round(courier.x), y: Math.round(courier.y) };
        let nextNode = null;
        if (courier.route && courier.route.length > 0) nextNode = courier.route[0];
        const currentEdge = nextNode ? getEdge(state.graph, currentNode, nextNode) : null;
        const trafficLevel = currentEdge ? getEffectiveTraffic(currentEdge) : 0.2;
        const isInTraffic = trafficLevel > 0.8;
        const isCarryingOrder = courier.status === 'delivering';
        const courierColor = isCarryingOrder ? '#f4c95d' : '#3c6ecf';

        context.fillStyle = courierColor;
        context.shadowColor = isInTraffic
            ? 'rgba(217, 108, 77, 0.5)'
            : isCarryingOrder
                ? 'rgba(244, 201, 93, 0.55)'
                : 'rgba(60, 110, 207, 0.35)';
        context.shadowBlur = isInTraffic ? 15 : 10;
        context.globalAlpha = isInTraffic ? 0.75 : 1;
        context.fillRect(courierPoint.x - size / 2, courierPoint.y - size / 2, size, size);
        context.shadowBlur = 0;
        context.globalAlpha = 1;
        context.strokeStyle = isInTraffic ? '#d96c4d' : '#fffdf8';
        context.lineWidth = isInTraffic ? 3 : 2;
        context.strokeRect(courierPoint.x - size / 2, courierPoint.y - size / 2, size, size);
    });
}

function updateMetrics() {
    const activeEtas = state.couriers
        .filter(c => c.request && c.status === 'to-pickup')
        .map(c => estimateArrival(c, c.request.pickup));
    const metrics = calculateMetrics(state, activeEtas);

    document.querySelector('#delivered').textContent = metrics.delivered;
    document.querySelector('#waiting').textContent = metrics.waiting;
    document.querySelector('#distance').textContent = metrics.averageDistance.toFixed(1);
    document.querySelector('#serviceLevel').textContent = `${metrics.serviceLevel.toFixed(0)}%`;
    document.querySelector('#waitTime').textContent = `${metrics.averageWaitTime.toFixed(1)}s`;
    document.querySelector('#eta').textContent = `${metrics.averageEta.toFixed(0)}s`;
    document.querySelector('#utilization').textContent = `${metrics.utilization.toFixed(0)}%`;
    document.querySelector('#p95Delivery').textContent = `${metrics.p95DeliveryTime.toFixed(0)}s`;
    renderFleet();
    const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
    document.querySelector('#clock').textContent = `${minutes}:${seconds}`;
    document.querySelector('#timelineFill').style.transform = `scaleX(${Math.min(state.elapsed / 180, 1)})`;
}

function estimateArrival(courier, target) {
    if (!courier.request) return 0;
    return travelTime(
        state.graph,
        { x: Math.round(courier.x), y: Math.round(courier.y) },
        target
    ) * 222;
}

function courierStatusLabel(courier) {
    if (courier.status === 'to-pickup') return 'Heading to pickup';
    if (courier.status === 'delivering') return 'Delivering order';
    return 'Available';
}

function renderFleet() {
    const fleetList = document.querySelector('#fleetList');
    fleetList.innerHTML = state.couriers.map(courier => `
        <div class="fleet-row">
            <span class="fleet-marker ${courier.status}"></span>
            <div class="fleet-identity">
                <strong>${courier.profile.name}</strong>
                <span>${courierStatusLabel(courier)}</span>
            </div>
            <div class="fleet-stats">
                <strong>${courier.profile.rating.toFixed(1)}</strong>
                <span>${courier.profile.completedOrders} delivered</span>
            </div>
        </div>
    `).join('');
}

function renderResults() {
    const resultsList = document.querySelector('#resultsList');
    resultsList.innerHTML = experimentResults.length === 0
        ? '<p class="empty-results">Run a scenario and record its result.</p>'
        : experimentResults.map(result => `
            <div class="result-row">
                <strong>${result.algorithm}</strong>
                <span>${result.delivered} delivered</span>
                <span>${result.p95DeliveryTime.toFixed(0)}s P95 / ${result.serviceLevel.toFixed(0)}% SLA</span>
                <span>${result.utilization.toFixed(0)}% fleet / ${result.rating.toFixed(1)} rating</span>
            </div>
        `).join('');
}

async function saveExperimentResults(results) {
    const seed = Number(document.querySelector('#seed').value) || 90210;
    const payload = {
        seed,
        durationSeconds: 180,
        courierCount: Number(courierInput.value),
        results
    };

    const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Experiment API returned ${response.status}: ${detail}`);
    }

    return response.json();
}

function recordResult() {
    const result = summarizeRun(
        state,
        algorithmInput.options[algorithmInput.selectedIndex].text
    );
    experimentResults.push(result);
    renderResults();
    statusLine.textContent = 'Run recorded locally. Saving experiment...';
    saveExperimentResults([result])
        .then(saved => {
            statusLine.textContent = `Experiment ${saved.id.slice(0, 8)} saved.`;
        })
        .catch(error => {
            statusLine.textContent = `Could not save experiment: ${error.message}`;
        });
}

function runComparison() {
    const liveState = state;
    const liveAlgorithm = algorithmInput.value;
    const liveRunning = state.running;
    const algorithms = ['nearest', 'priority', 'balanced', 'traffic'];
    const benchmarkResults = [];

    benchmarkMode = true;
    runExperiment({
        grid,
        depots,
        courierNames,
        seed: Number(document.querySelector('#seed').value) || 90210,
        courierCount: Number(courierInput.value),
        demandDelay: demandDelay(),
        durationSeconds: 180,
        algorithms
    }).forEach(resultState => {
        benchmarkResults.push(summarizeRun(
            resultState,
            algorithmInput.querySelector(`[value="${resultState.algorithm}"]`).textContent
        ));
    });

    state = liveState;
    algorithmInput.value = liveAlgorithm;
    state.running = liveRunning;
    benchmarkMode = false;
    experimentResults.splice(0, experimentResults.length, ...benchmarkResults);
    renderResults();
    updateMetrics();
    draw();
    statusLine.textContent = 'Comparison complete. Saving experiment...';
    saveExperimentResults(benchmarkResults)
        .then(saved => {
            statusLine.textContent = `Comparison saved as experiment ${saved.id.slice(0, 8)}.`;
        })
        .catch(error => {
            statusLine.textContent = `Comparison complete, but save failed: ${error.message}`;
        });
}

function downloadExperimentResults(format) {
    if (experimentResults.length === 0) {
        statusLine.textContent = 'Run or record an experiment before exporting results.';
        return;
    }

    const content = format === 'json'
        ? JSON.stringify(experimentResults, null, 2)
        : [
            'algorithm,seed,couriers,delivered,waiting,pending,assigned,averageDistance,plannedAverageDistance,averagePickupTime,p95DeliveryTime,serviceLevel,utilization,rating',
            ...experimentResults.map(result => [
                result.algorithm, result.seed, result.couriers, result.delivered, result.waiting,
                result.pending, result.assigned, result.averageDistance.toFixed(2),
                result.plannedAverageDistance.toFixed(2), result.averagePickupTime.toFixed(2),
                result.p95DeliveryTime.toFixed(2), result.serviceLevel.toFixed(2),
                result.utilization.toFixed(2), result.rating.toFixed(2)
            ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
        ].join('\n');
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dispatchlab-experiment.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    statusLine.textContent = `Experiment exported as ${format.toUpperCase()}.`;
}

function frame(timestamp) {
    const delta = Math.min(timestamp - lastFrame, 80);
    lastFrame = timestamp;
    if (state.running) update(delta);
    draw();
    animationFrame = requestAnimationFrame(frame);
}

function toggleRunning() {
    state.running = !state.running;
    playButton.innerHTML = state.running ? '<span id="playIcon">||</span> Pause simulation' : '<span id="playIcon">></span> Start simulation';
    runState.textContent = state.running ? 'RUNNING' : 'PAUSED';
    runState.style.color = state.running ? 'var(--teal)' : 'var(--coral)';
    statusLine.textContent = state.running ? 'Dispatching requests in real time.' : 'Simulation paused.';
}

function reset() {
    cancelAnimationFrame(animationFrame);
    state = createState();
    runState.textContent = 'PAUSED';
    runState.style.color = 'var(--coral)';
    playButton.innerHTML = '<span id="playIcon">></span> Start simulation';
    statusLine.textContent = 'Ready for a new scenario.';
    updateMetrics();
    draw();
    animationFrame = requestAnimationFrame(frame);
}

algorithmInput.addEventListener('change', () => {
    algorithmNote.textContent = algorithmNotes[algorithmInput.value];
    state.algorithm = algorithmInput.value;
    draw();
});
demandInput.addEventListener('input', () => {
    document.querySelector('#demandValue').textContent = ['Low', 'Medium', 'High'][Number(demandInput.value) - 1];
});
document.querySelector('#seed').addEventListener('change', reset);
courierInput.addEventListener('input', () => {
    document.querySelector('#courierValue').textContent = `${courierInput.value} riders`;
    reset();
});
playButton.addEventListener('click', toggleRunning);
resetButton.addEventListener('click', reset);
document.querySelector('#recordButton').addEventListener('click', recordResult);
document.querySelector('#compareButton').addEventListener('click', runComparison);
exportJsonButton.addEventListener('click', () => downloadExperimentResults('json'));
exportCsvButton.addEventListener('click', () => downloadExperimentResults('csv'));
canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect();
    const pointer = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
    };
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    let closestNode = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    state.graph.nodes.forEach(node => {
        const center = point(node, width, height);
        const dx = pointer.x - center.x;
        const dy = pointer.y - center.y;
        const distance = (dx * dx) + (dy * dy);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestNode = node;
        }
    });

    const pickup = closestNode ? { x: closestNode.x, y: closestNode.y } : nearestNode(state.graph, { x: 0, y: 0 });
    addRequest(pickup);
});
window.addEventListener('resize', resizeCanvas);
state = createState();
resizeCanvas();
updateMetrics();
renderResults();
animationFrame = requestAnimationFrame(frame);
