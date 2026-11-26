import { nearestNode, getEffectiveTraffic, getEdge } from './dispatch-logic.js?v=20261125-5';
import { calculateMetrics, summarizeRun } from './metrics.js?v=20261124-2';
import { t } from './i18n.js?v=20261125-1';
import {
    addSimulationRequest,
    advanceSimulation,
    createSimulationState,
    DEFAULT_DEMAND_DELAY_SECONDS,
    generateScenarioEvents,
    travelTime
} from './simulation-engine.js?v=20261125-5';

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
const singleRunControls = [
    algorithmInput,
    demandInput,
    courierInput,
    document.querySelector('#seed'),
    document.querySelector('#recordButton')
];
const grid = { columns: 15, rows: 6 };
const SIMULATION_DURATION_SECONDS = 3600;
const SINGLE_RUN_SPEED = 24;
const MAX_FRAME_DELTA_MS = 50;
const canvasRatio = 5.25 / grid.columns;
const depots = [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 2, y: 4 }, { x: 12, y: 4 }];
const requestColors = ['#e5684c', '#f09b52', '#c94f59'];
const courierNames = ['Maya', 'Leo', 'Nora', 'Sam', 'Iris', 'Alex', 'Zoe', 'Noah', 'Lina', 'Kai'];
const algorithmNotes = {
    independent: 'Each courier decides whether to accept a nearby order after a brief 20-second delay.',
    self_selection: 'Couriers choose orders using urgency, distance, traffic, and an incentive after a brief 10-second decision.',
    first_available: 'The first available courier takes the next order immediately and follows a random route without considering traffic. Simple, but not always efficient.',
    traffic: 'The system chooses the courier with the fastest route through current traffic.'
};
const algorithmLabels = {
    first_available: 'Naive: first available courier',
    independent: 'Couriers choose individually',
    self_selection: 'Couriers choose with incentives',
    traffic: 'Traffic-aware assignment',
    nearest: 'Nearest courier'
};
let state;
let animationFrame;
const experimentResults = [];
const DASHBOARD_STORAGE_KEY = 'dispatchlab.latest-experiment';
let benchmarkMode = false;
let comparisonRunning = false;
let comparisonPaused = false;
let comparisonCancelled = false;
let singleRunActive = false;
let singleRunPaused = false;
let lastSingleRunFrame = null;
let singleRunAlgorithm;

function themeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

function demandDelay() { return [56, DEFAULT_DEMAND_DELAY_SECONDS, 17][Number(demandInput.value) - 1]; }

function addRequest(station, destination) {
    addSimulationRequest(state, station, destination);
    if (!benchmarkMode) statusLine.textContent = t('New delivery request added to the queue.');
    if (!benchmarkMode) draw();
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
    if (congestion >= 2.2) return '#d96c4d';
    if (congestion >= 1) return '#e7b75d';
    return '#8ab7b0';
}

function drawStreetNetwork(width, height) {
    context.fillStyle = themeColor('--map-surface');
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
            context.lineWidth = 1.2 + Math.min(congestion, 2.5) * 1.2;
            context.globalAlpha = 0.8;
            context.stroke();
        });
    });

    context.globalAlpha = 1;
    context.fillStyle = themeColor('--map-node');
    context.strokeStyle = themeColor('--map-border');
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
        context.fillStyle = themeColor('--map-mark');
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

        context.fillStyle = themeColor('--map-mark');
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
        const isInTraffic = trafficLevel > 1.3;
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
    reportButton.hidden = experimentResults.length === 0;
    resultsList.innerHTML = experimentResults.length === 0
        ? `<p class="empty-results">${t('Run a scenario and record its result.')}</p>`
        : experimentResults.map(result => `
            <div class="result-row">
                <strong>${escapeHtml(t(algorithmLabels[result.algorithm] ?? result.algorithm))}</strong>
                <span class="result-metric ${resultClass(result, 'delivered', true)}">${result.delivered} ${t('Delivered').toLowerCase()}</span>
                <span class="result-metric ${resultClass(result, 'pending', false)}">${result.pending} ${t('Pending').toLowerCase()}</span>
                <span class="result-metric ${resultClass(result, 'p95DeliveryTime', false)}">${result.p95DeliveryTime.toFixed(0)}s ${t('Slowest 5% delivery').toLowerCase()}</span>
                <span class="result-metric ${resultClass(result, 'serviceLevel', true)}">${result.serviceLevel.toFixed(0)}% SLA</span>
                <span class="result-metric ${resultClass(result, 'fleetThroughput', true)}">${result.fleetThroughput.toFixed(1)} ${t('orders/rider-hour')}</span>
                <span class="result-metric ${resultClass(result, 'rating', true)}">${result.rating.toFixed(1)} rating</span>
            </div>
        `).join('');
}

function summarizeForDisplay(simulationState, algorithm) {
    const result = summarizeRun(simulationState, algorithm);
    return { ...result, fleetThroughput: calculateMetrics(simulationState).fleetThroughput };
}

function saveDashboardSnapshot(results) {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        seed: Number(document.querySelector('#seed').value) || 90210,
        courierCount: Number(courierInput.value),
        demand: Number(demandInput.value),
        durationSeconds: SIMULATION_DURATION_SECONDS,
        results
    }));
}

function openDashboard() {
    if (experimentResults.length === 0) {
        statusLine.textContent = t('Run or compare a scenario before opening the dashboard.');
        return;
    }
    saveDashboardSnapshot(experimentResults);
    window.location.href = '/dashboard.html';
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
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
        results: results.map(({ fleetThroughput, ...result }) => result)
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
    const result = summarizeForDisplay(state, algorithmInput.value);
    experimentResults.push(result);
    saveDashboardSnapshot(experimentResults);
    renderResults();
    statusLine.textContent = t('Run recorded locally. Saving experiment...');
    saveExperimentResults([result])
        .then(saved => {
            statusLine.textContent = `${t('Experiment')} ${saved.id.slice(0, 8)} ${t('saved.')}`;
        })
        .catch(error => {
            statusLine.textContent = `${t('Run kept locally. Server save unavailable')} (${error.message}).`;
        });
}

function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function waitForComparisonResume() {
    while (comparisonPaused && !comparisonCancelled) await wait(100);
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

function setSingleRunProgress(algorithm, progress) {
    const progressBar = document.querySelector('#comparisonProgress');
    const progressLabel = document.querySelector('#comparisonProgressLabel');
    const progressWrap = document.querySelector('#comparisonProgressWrap');
    progressWrap.classList.add('active');
    progressBar.value = progress * 100;
    progressLabel.textContent = `${t('Single run')} · ${Math.round(progress * 100)}%`;
    document.querySelectorAll('.strategy-progress').forEach(row => {
        const isSelected = row.dataset.strategyProgress === algorithm;
        const bar = row.querySelector('progress');
        bar.value = isSelected ? progress * 100 : 0;
        row.classList.toggle('active', isSelected && progress < 1);
        row.classList.toggle('complete', isSelected && progress >= 1);
    });
}

function algorithmsForComparison() {
    return ['first_available', 'independent', 'self_selection', 'traffic'];
}

function strategyIndexFor(strategy) {
    return algorithmsForComparison().indexOf(strategy);
}

function finishSingleSimulation(error) {
    if (!singleRunActive) return;

    singleRunActive = false;
    singleRunPaused = false;
    lastSingleRunFrame = null;
    benchmarkMode = false;
    singleRunControls.forEach(control => { control.disabled = false; });
    document.querySelector('#compareButton').disabled = false;
    playButton.innerHTML = `<span id="playIcon">></span> ${t('Start simulation')}`;

    if (error) {
        console.error('Individual simulation failed', error);
        runState.textContent = 'PAUSED';
        runState.style.color = 'var(--coral)';
        statusLine.textContent = `${t('Simulation failed')} (${error.message}).`;
        return;
    }

    const result = summarizeForDisplay(state, singleRunAlgorithm);
    experimentResults.push(result);
    saveDashboardSnapshot(experimentResults);
    renderResults();
    setSingleRunProgress(singleRunAlgorithm, 1);
    runState.textContent = 'COMPLETED';
    runState.style.color = 'var(--teal)';
    statusLine.textContent = t('Simulation complete. Saving experiment...');
    saveExperimentResults([result])
        .then(saved => {
            statusLine.textContent = `${t('Experiment')} ${saved.id.slice(0, 8)} ${t('saved.')}`;
        })
        .catch(saveError => {
            statusLine.textContent = `${t('Run kept locally. Server save unavailable')} (${saveError.message}).`;
        });
}

function runSingleSimulation() {
    if (singleRunActive || comparisonRunning) return;

    singleRunAlgorithm = algorithmInput.value;
    const seed = Number(document.querySelector('#seed').value) || 90210;
    const courierCount = Number(courierInput.value);
    const durationSeconds = SIMULATION_DURATION_SECONDS;
    const scenarioEvents = generateScenarioEvents({
        grid,
        seed,
        courierCount,
        demandDelay: demandDelay(),
        durationSeconds
    });
    state = createSimulationState({
        grid,
        depots,
        courierNames,
        seed,
        courierCount,
        algorithm: singleRunAlgorithm,
        scenarioEvents,
        demandDelay: demandDelay()
    });
    state.running = false;
    singleRunActive = true;
    singleRunPaused = false;
    lastSingleRunFrame = null;
    benchmarkMode = true;
    singleRunControls.forEach(control => { control.disabled = true; });
    document.querySelector('#compareButton').disabled = true;
    playButton.innerHTML = `<span id="playIcon">||</span> ${t('Pause simulation')}`;
    runState.textContent = 'RUNNING';
    runState.style.color = 'var(--teal)';
    statusLine.textContent = t('Running selected strategy.');
    setSingleRunProgress(singleRunAlgorithm, 0);
    updateMetrics();
    draw();
}

async function runComparison() {
    if (comparisonRunning || singleRunActive) return;

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
    comparisonCancelled = false;
    const compareButton = document.querySelector('#compareButton');
    const comparisonControls = [
        algorithmInput,
        demandInput,
        courierInput,
        document.querySelector('#seed')
    ];
    compareButton.disabled = true;
    compareButton.textContent = t('Comparing...');
    playButton.innerHTML = '<span id="playIcon">||</span> Pause comparison';
    comparisonControls.forEach(control => { control.disabled = true; });
    liveState.running = false;

    try {
        for (let index = 0; index < algorithms.length; index += 1) {
            if (comparisonCancelled) break;
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

            statusLine.textContent = `${t('Comparing')} ${label} (${index + 1}/${algorithms.length})...`;
            setComparisonProgress(index, 0);
            for (let elapsed = 0; elapsed < durationSeconds * 1000; elapsed += stepMilliseconds * replayStepsPerTick) {
                await waitForComparisonResume();
                if (comparisonCancelled) break;
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

            if (comparisonCancelled) break;
            benchmarkResults.push(summarizeForDisplay(state, algorithm));
            renderResults();
            await wait(350);
        }

        if (!comparisonCancelled) {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && comparisonRunning) {
                    updateMetrics();
                    draw();
                }
            });

            experimentResults.splice(0, experimentResults.length, ...benchmarkResults);
            renderResults();
            saveDashboardSnapshot(benchmarkResults);
            statusLine.textContent = t('Comparison complete. Saving experiment...');
            saveExperimentResults(benchmarkResults)
                .then(saved => {
                    statusLine.textContent = `${t('Comparison saved as experiment')} ${saved.id.slice(0, 8)}.`;
                })
                .catch(error => {
                    statusLine.textContent = `${t('Comparison complete. Results kept locally; server save unavailable')} (${error.message}).`;
                });
        }
    } finally {
        const wasCancelled = comparisonCancelled;
        if (!wasCancelled) state = liveState;
        algorithmInput.value = liveAlgorithm;
        if (!wasCancelled) state.running = liveRunning;
        benchmarkMode = false;
        comparisonRunning = false;
        comparisonPaused = false;
        comparisonCancelled = false;
        compareButton.disabled = false;
        compareButton.textContent = t('Compare strategies');
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
        statusLine.textContent = t('Run or record an experiment before exporting results.');
        return;
    }

    const content = format === 'json'
        ? JSON.stringify(experimentResults, null, 2)
        : [
            'algorithm,seed,couriers,delivered,waiting,pending,assigned,averageDistance,plannedAverageDistance,averagePickupTime,p95DeliveryTime,serviceLevel,utilization,fleetThroughput,rating',
            ...experimentResults.map(result => [
                result.algorithm, result.seed, result.couriers, result.delivered, result.waiting,
                result.pending, result.assigned, result.averageDistance.toFixed(2),
                result.plannedAverageDistance.toFixed(2), result.averagePickupTime.toFixed(2),
                result.p95DeliveryTime.toFixed(2), result.serviceLevel.toFixed(2),
                result.utilization.toFixed(2), result.fleetThroughput.toFixed(2), result.rating.toFixed(2)
            ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
        ].join('\n');
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dispatchlab-experiment.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    statusLine.textContent = `${t('Experiment exported as')} ${format.toUpperCase()}.`;
}

function frame(timestamp) {
    if (singleRunActive) {
        if (singleRunPaused || lastSingleRunFrame === null) {
            lastSingleRunFrame = timestamp;
        } else {
            const wallDelta = Math.min(timestamp - lastSingleRunFrame, MAX_FRAME_DELTA_MS);
            lastSingleRunFrame = timestamp;
            const remainingSimulationMs = Math.max(
                (SIMULATION_DURATION_SECONDS - state.elapsed) * 1000,
                0
            );
            const simulationDelta = Math.min(wallDelta * SINGLE_RUN_SPEED, remainingSimulationMs);
            try {
                advanceSimulation(state, simulationDelta);
                updateMetrics();
                setSingleRunProgress(
                    singleRunAlgorithm,
                    Math.min(state.elapsed / SIMULATION_DURATION_SECONDS, 1)
                );
                if (state.elapsed >= SIMULATION_DURATION_SECONDS) finishSingleSimulation();
            } catch (error) {
                finishSingleSimulation(error);
            }
        }
    } else {
        lastSingleRunFrame = null;
    }
    draw();
    animationFrame = requestAnimationFrame(frame);
}

function toggleRunning() {
    if (comparisonRunning) {
        if (comparisonCancelled) return;
        comparisonPaused = !comparisonPaused;
        playButton.innerHTML = comparisonPaused
            ? '<span id="playIcon">></span> Resume comparison'
            : '<span id="playIcon">||</span> Pause comparison';
        statusLine.textContent = comparisonPaused ? t('Comparison paused.') : t('Comparison resumed.');
        return;
    }

    if (singleRunActive) {
        singleRunPaused = !singleRunPaused;
        lastSingleRunFrame = null;
        playButton.innerHTML = singleRunPaused
            ? `<span id="playIcon">></span> ${t('Resume simulation')}`
            : `<span id="playIcon">||</span> ${t('Pause simulation')}`;
        runState.textContent = singleRunPaused ? 'PAUSED' : 'RUNNING';
        runState.style.color = singleRunPaused ? 'var(--coral)' : 'var(--teal)';
        statusLine.textContent = t(singleRunPaused ? 'Simulation paused.' : 'Simulation resumed.');
        return;
    }

    runSingleSimulation();
}

function reset() {
    if (comparisonRunning) {
        comparisonCancelled = true;
        comparisonPaused = false;
    }
    if (singleRunActive) {
        singleRunActive = false;
        singleRunPaused = false;
        lastSingleRunFrame = null;
        benchmarkMode = false;
        singleRunControls.forEach(control => { control.disabled = false; });
        document.querySelector('#compareButton').disabled = false;
    }
    cancelAnimationFrame(animationFrame);
    state = createState();
    experimentResults.splice(0, experimentResults.length);
    document.querySelector('#comparisonProgressWrap').classList.remove('active');
    document.querySelector('#comparisonProgress').value = 0;
    document.querySelector('#comparisonProgressLabel').textContent = t('Comparison ready');
    document.querySelectorAll('.strategy-progress').forEach(row => {
        row.classList.remove('active', 'complete');
        row.querySelector('progress').value = 0;
    });
    runState.textContent = 'PAUSED';
    runState.style.color = 'var(--coral)';
    playButton.innerHTML = '<span id="playIcon">></span> Start simulation';
    statusLine.textContent = t('New scenario ready. Start the simulation or place a request on the map.');
    updateMetrics();
    renderResults();
    draw();
    animationFrame = requestAnimationFrame(frame);
}

algorithmInput.addEventListener('change', () => {
    algorithmNote.textContent = t(algorithmNotes[algorithmInput.value]);
    state.algorithm = algorithmInput.value;
    draw();
});
demandInput.addEventListener('input', () => {
    document.querySelector('#demandValue').textContent = t(['Low', 'Medium', 'High'][Number(demandInput.value) - 1]);
});
document.querySelector('#seed').addEventListener('change', reset);
courierInput.addEventListener('input', () => {
    document.querySelector('#courierValue').textContent = `${courierInput.value} ${t('riders')}`;
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
reportButton.addEventListener('click', openDashboard);
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
document.addEventListener('dispatchlab:language', () => {
    algorithmNote.textContent = t(algorithmNotes[algorithmInput.value]);
    document.querySelector('#demandValue').textContent = t(['Low', 'Medium', 'High'][Number(demandInput.value) - 1]);
    document.querySelector('#courierValue').textContent = `${courierInput.value} ${t('riders')}`;
    renderResults();
});
document.addEventListener('dispatchlab:theme', draw);
animationFrame = requestAnimationFrame(frame);
