import { nearestNode, getEffectiveTraffic, getEdge } from './dispatch-logic.js';
import { calculateMetrics, summarizeRun } from './metrics.js';
import {
    addSimulationRequest,
    advanceSimulation,
    createSimulationState,
    generateScenarioEvents,
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
const reportButton = document.querySelector('#reportButton');
const runState = document.querySelector('#runState');
const statusLine = document.querySelector('#statusLine');
const algorithmNote = document.querySelector('#algorithmNote');
const grid = { columns: 15, rows: 6 };
const SIMULATION_DURATION_SECONDS = 3600;
const canvasRatio = 5.25 / grid.columns;
const depots = [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 2, y: 4 }, { x: 12, y: 4 }];
const requestColors = ['#e5684c', '#f09b52', '#c94f59'];
const courierNames = ['Maya', 'Leo', 'Nora', 'Sam', 'Iris', 'Alex', 'Zoe', 'Noah', 'Lina', 'Kai'];
const algorithmNotes = {
    independent: 'Couriers accept requests individually after a realistic decision delay.',
    self_selection: 'Couriers choose the request with the best local payoff from an efficiency bonus.',
    first_available: 'Assigns the first idle courier without optimizing distance. Simple, but costly.',
    traffic: 'Chooses the courier with the fastest route through current traffic.'
};
let state;
let lastFrame = 0;
let animationFrame;
const experimentResults = [];
let benchmarkMode = false;
let comparisonRunning = false;
let comparisonPaused = false;

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

function demandDelay() { return [56, 34, 17][Number(demandInput.value) - 1]; }

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
    const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
    document.querySelector('#clock').textContent = `${minutes}:${seconds}`;
    document.querySelector('#timelineFill').style.transform = `scaleX(${Math.min(state.elapsed / SIMULATION_DURATION_SECONDS, 1)})`;
}

function estimateArrival(courier, target) {
    if (!courier.request) return 0;
    return travelTime(
        state.graph,
        { x: Math.round(courier.x), y: Math.round(courier.y) },
        target
    ) * 222;
}

function renderResults() {
    const resultsList = document.querySelector('#resultsList');
    resultsList.innerHTML = experimentResults.length === 0
        ? '<p class="empty-results">Run a scenario and record its result.</p>'
        : experimentResults.map(result => `
            <div class="result-row">
                <strong>${result.algorithm}</strong>
                <span class="result-metric ${resultClass(result, 'delivered', true)}">${result.delivered} delivered</span>
                <span class="result-metric ${resultClass(result, 'pending', false)}">${result.pending} pending</span>
                <span class="result-metric ${resultClass(result, 'p95DeliveryTime', false)}">${result.p95DeliveryTime.toFixed(0)}s P95</span>
                <span class="result-metric ${resultClass(result, 'serviceLevel', true)}">${result.serviceLevel.toFixed(0)}% SLA</span>
                <span class="result-metric ${resultClass(result, 'utilization', true)}">${result.utilization.toFixed(0)}% fleet</span>
                <span class="result-metric ${resultClass(result, 'rating', true)}">${result.rating.toFixed(1)} rating</span>
            </div>
        `).join('');
}

function renderReport() {
    const body = document.querySelector('#reportTableBody');
    const summary = document.querySelector('#reportSummary');
    if (experimentResults.length === 0) {
        summary.textContent = 'Run a comparison to generate a report.';
        body.innerHTML = '';
        return;
    }

    const best = [...experimentResults].sort((a, b) => b.delivered - a.delivered)[0];
    summary.textContent = `${best.algorithm} delivered the most orders in this workload. The report shows trade-offs, not a universal winner.`;
    body.innerHTML = experimentResults.map(result => `
        <tr>
            <td><strong>${result.algorithm}</strong></td>
            <td class="${resultClass(result, 'delivered', true)}">${result.delivered}</td>
            <td class="${resultClass(result, 'pending', false)}">${result.pending}</td>
            <td class="${resultClass(result, 'p95DeliveryTime', false)}">${result.p95DeliveryTime.toFixed(0)}s</td>
            <td class="${resultClass(result, 'serviceLevel', true)}">${result.serviceLevel.toFixed(0)}%</td>
            <td class="${resultClass(result, 'rating', true)}">${result.rating.toFixed(1)}</td>
        </tr>
    `).join('');
}

function resultClass(result, metric, higherIsBetter) {
    if (experimentResults.length < 2) return '';
    const values = experimentResults.map(item => item[metric]);
    const best = higherIsBetter ? Math.max(...values) : Math.min(...values);
    const worst = higherIsBetter ? Math.min(...values) : Math.max(...values);
    if (best === worst || result[metric] === best) return result[metric] === best ? 'result-best' : '';
    return result[metric] === worst ? 'result-worst' : 'result-middle';
}

async function saveExperimentResults(results) {
    const seed = Number(document.querySelector('#seed').value) || 90210;
    const payload = {
        seed,
        durationSeconds: SIMULATION_DURATION_SECONDS,
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

function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function waitForComparisonResume() {
    while (comparisonPaused) await wait(100);
}

function setComparisonProgress(strategyIndex, progress) {
    const progressBar = document.querySelector('#comparisonProgress');
    const progressLabel = document.querySelector('#comparisonProgressLabel');
    const progressWrap = document.querySelector('#comparisonProgressWrap');
    if (!progressBar || !progressLabel) return;
    progressWrap.classList.add('active');
    const totalStrategies = algorithmsForComparison().length;
    progressBar.value = ((strategyIndex + progress) / totalStrategies) * 100;
    progressLabel.textContent = `Comparison ${strategyIndex + 1} / ${totalStrategies} · ${Math.round(progress * 100)}%`;
    const activeStrategy = algorithmsForComparison()[strategyIndex];
    document.querySelectorAll('.strategy-progress').forEach(row => {
        const strategy = row.dataset.strategyProgress;
        const bar = row.querySelector('progress');
        const isComplete = strategyIndex > strategyIndexFor(strategy);
        bar.value = isComplete ? 100 : strategy === activeStrategy ? progress * 100 : 0;
        row.classList.toggle('active', strategy === activeStrategy);
        row.classList.toggle('complete', isComplete);
    });
}

function algorithmsForComparison() {
    return ['first_available', 'independent', 'self_selection', 'traffic'];
}

function strategyIndexFor(strategy) {
    return algorithmsForComparison().indexOf(strategy);
}

async function runComparison() {
    if (comparisonRunning) return;

    const liveState = state;
    const liveAlgorithm = algorithmInput.value;
    const liveRunning = state.running;
    const algorithms = algorithmsForComparison();
    const benchmarkResults = [];
    const seed = Number(document.querySelector('#seed').value) || 90210;
    const courierCount = Number(courierInput.value);
    const durationSeconds = SIMULATION_DURATION_SECONDS;
    const stepMilliseconds = 2000;
    const replayStepsPerTick = 3;
    const replayDelay = 1;
    const scenarioEvents = generateScenarioEvents({
        grid,
        seed,
        courierCount,
        demandDelay: demandDelay(),
        durationSeconds
    });

    benchmarkMode = true;
    comparisonRunning = true;
    comparisonPaused = false;
    const compareButton = document.querySelector('#compareButton');
    const comparisonControls = [
        resetButton,
        algorithmInput,
        demandInput,
        courierInput,
        document.querySelector('#seed')
    ];
    compareButton.disabled = true;
    compareButton.textContent = 'Comparing...';
    playButton.innerHTML = '<span id="playIcon">||</span> Pause comparison';
    comparisonControls.forEach(control => { control.disabled = true; });
    liveState.running = false;

    try {
        for (let index = 0; index < algorithms.length; index += 1) {
            const algorithm = algorithms[index];
            const label = algorithmInput.querySelector(`[value="${algorithm}"]`).textContent;
            state = createSimulationState({
                grid,
                depots,
                courierNames,
                seed,
                courierCount,
                algorithm,
                scenarioEvents,
                demandDelay: demandDelay()
            });

            statusLine.textContent = `Comparing ${label} (${index + 1}/${algorithms.length})...`;
            setComparisonProgress(index, 0);
            for (let elapsed = 0; elapsed < durationSeconds * 1000; elapsed += stepMilliseconds * replayStepsPerTick) {
                await waitForComparisonResume();
                for (let step = 0; step < replayStepsPerTick; step += 1) {
                    advanceSimulation(state, stepMilliseconds);
                }
                if (!document.hidden) {
                    updateMetrics();
                    draw();
                    setComparisonProgress(
                        index,
                        Math.min((elapsed + (stepMilliseconds * replayStepsPerTick)) / (durationSeconds * 1000), 1)
                    );
                }
                await wait(replayDelay);
            }

            benchmarkResults.push(summarizeRun(state, label));
            renderResults();
            await wait(350);
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && comparisonRunning) {
                updateMetrics();
                draw();
            }
        });

        experimentResults.splice(0, experimentResults.length, ...benchmarkResults);
        renderResults();
        statusLine.textContent = 'Comparison complete. Saving experiment...';
        saveExperimentResults(benchmarkResults)
            .then(saved => {
                statusLine.textContent = `Comparison saved as experiment ${saved.id.slice(0, 8)}.`;
            })
            .catch(error => {
                statusLine.textContent = `Comparison complete, but save failed: ${error.message}`;
            });
    } finally {
        state = liveState;
        algorithmInput.value = liveAlgorithm;
        state.running = liveRunning;
        benchmarkMode = false;
        comparisonRunning = false;
        comparisonPaused = false;
        compareButton.disabled = false;
        compareButton.textContent = 'Compare strategies';
        comparisonControls.forEach(control => { control.disabled = false; });
        playButton.innerHTML = liveRunning
            ? '<span id="playIcon">||</span> Pause simulation'
            : '<span id="playIcon">></span> Start simulation';
        document.querySelector('#comparisonProgressWrap').classList.remove('active');
        updateMetrics();
        draw();
    }
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
    if (comparisonRunning) {
        comparisonPaused = !comparisonPaused;
        playButton.innerHTML = comparisonPaused
            ? '<span id="playIcon">></span> Resume comparison'
            : '<span id="playIcon">||</span> Pause comparison';
        statusLine.textContent = comparisonPaused ? 'Comparison paused.' : 'Comparison resumed.';
        return;
    }

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
const compareDialog = document.querySelector('#compareDialog');
const compareButton = document.querySelector('#compareButton');
compareButton.addEventListener('click', () => compareDialog.showModal());
document.querySelector('#confirmCompareButton').addEventListener('click', event => {
    event.preventDefault();
    compareDialog.close();
    runComparison();
});
exportJsonButton.addEventListener('click', () => downloadExperimentResults('json'));
exportCsvButton.addEventListener('click', () => downloadExperimentResults('csv'));
reportButton.addEventListener('click', () => {
    renderReport();
    document.querySelector('#reportDialog').showModal();
});
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
