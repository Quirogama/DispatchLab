import { buildGridGraph, nearestNode, nodeDistance, shortestPath, recomputeEdgeWeights, getEffectiveTraffic, getEdge } from './dispatch-logic.js';

const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const algorithmInput = document.querySelector('#algorithm');
const demandInput = document.querySelector('#demand');
const courierInput = document.querySelector('#courierCount');
const playButton = document.querySelector('#playButton');
const resetButton = document.querySelector('#resetButton');
const runState = document.querySelector('#runState');
const statusLine = document.querySelector('#statusLine');
const algorithmNote = document.querySelector('#algorithmNote');
const grid = { columns: 15, rows: 6 };
const canvasRatio = grid.rows / grid.columns;
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

function randomStation(exclude) {
    let station;
    do {
        station = {
            x: Math.floor(Math.random() * grid.columns),
            y: Math.floor(Math.random() * grid.rows)
        };
    } while (exclude && station.x === exclude.x && station.y === exclude.y);
    return station;
}

function createState() {
    const courierCount = Number(courierInput.value);
    return {
        running: false,
        elapsed: 0,
        delivered: 0,
        totalDistance: 0,
        graph: buildGridGraph(grid),
        requests: [],
        couriers: Array.from({ length: courierCount }, (_, index) => ({
            id: index,
            x: depots[index % depots.length].x,
            y: depots[index % depots.length].y,
            home: { ...depots[index % depots.length] },
            status: 'idle',
            request: null,
            route: [],
            distance: 0,
            profile: {
                name: courierNames[index % courierNames.length],
                completedOrders: 0,
                totalPickupTime: 0,
                totalDeliveryTime: 0,
                totalDistance: 0,
                rating: 5.0
            }
        }))
    };
}

function distance(a, b) {
    const start = { x: Math.round(a.x), y: Math.round(a.y) };
    const end = { x: Math.round(b.x), y: Math.round(b.y) };
    return nodeDistance(state.graph, start, end);
}

function demandDelay() { return [2.8, 1.7, 0.85][Number(demandInput.value) - 1]; }

function setCourierRoute(courier, target) {
    const start = { x: Math.round(courier.x), y: Math.round(courier.y) };
    const route = shortestPath(state.graph, start, target);
    courier.route = route.length > 1 ? route.slice(1) : [];
}

function addRequest(station, destination = randomStation(station)) {
    state.requests.push({
        id: Date.now() + Math.random(),
        pickup: { ...station },
        destination: { ...destination },
        priority: 1 + Math.floor(Math.random() * 3),
        age: 0,
        createdAt: state.elapsed,
        color: requestColors[Math.floor(Math.random() * requestColors.length)]
    });
    statusLine.textContent = 'New delivery request added to the queue.';
    assignRequests();
    draw();
}

function spawnRequest() {
    if (state.requests.length > 10) return;
    addRequest(randomStation());
}

function roadDistance(from, to) {
    const startKey = `${Math.round(from.x)},${Math.round(from.y)}`;
    const targetKey = `${Math.round(to.x)},${Math.round(to.y)}`;
    const queue = [{ key: startKey, distance: 0 }];
    const visited = new Set([startKey]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.key === targetKey) return current.distance;

        (state.graph.adjacency.get(current.key) ?? []).forEach(edge => {
            const nextKey = `${edge.x},${edge.y}`;
            if (visited.has(nextKey)) return;
            visited.add(nextKey);
            queue.push({ key: nextKey, distance: current.distance + 1 });
        });
    }

    return Number.POSITIVE_INFINITY;
}

function trafficTravelTime(from, to) {
    const start = { x: Math.round(from.x), y: Math.round(from.y) };
    const target = { x: Math.round(to.x), y: Math.round(to.y) };
    const route = shortestPath(state.graph, start, target);
    let totalTime = 0;

    for (let index = 0; index < route.length - 1; index += 1) {
        const edge = getEdge(state.graph, route[index], route[index + 1]);
        const traffic = edge ? getEffectiveTraffic(edge) : 0.2;
        totalTime += (edge?.weight ?? 1) * traffic;
    }

    return totalTime;
}

function updateCourierRating(courier, request) {
    const pickupTime = request.pickedUpAt - request.assignedAt;
    const deliveryTime = request.deliveredAt - request.pickedUpAt;
    const pickupScore = Math.max(0, 1 - pickupTime / 90);
    const deliveryScore = Math.max(0, 1 - deliveryTime / 180);
    const orderRating = 3 + ((pickupScore + deliveryScore) / 2) * 2;
    const completed = courier.profile.completedOrders;
    courier.profile.rating = ((courier.profile.rating * completed) + orderRating) / (completed + 1);
    courier.profile.completedOrders += 1;
    courier.profile.totalPickupTime += pickupTime;
    courier.profile.totalDeliveryTime += deliveryTime;
}

function chooseCourier(request, available) {
    if (algorithmInput.value === 'traffic') {
        return [...available].sort((a, b) => {
            return trafficTravelTime(a, request.pickup) - trafficTravelTime(b, request.pickup);
        })[0];
    }

    if (algorithmInput.value === 'balanced') {
        return [...available].sort((a, b) => {
            const workloadA = (a.profile.completedOrders * 10) + roadDistance(a, request.pickup);
            const workloadB = (b.profile.completedOrders * 10) + roadDistance(b, request.pickup);
            return workloadA - workloadB;
        })[0];
    }

    return [...available].sort((a, b) => {
        return roadDistance(a, request.pickup) - roadDistance(b, request.pickup);
    })[0];
}

function assignRequests() {
    const available = state.couriers.filter(courier => courier.status === 'idle');
    state.requests.filter(request => !request.assigned).sort((a, b) => b.priority - a.priority).forEach(request => {
        const courier = chooseCourier(request, available);
        if (!courier) return;
        request.assigned = courier.id;
        request.assignedAt = state.elapsed;
        courier.status = 'to-pickup';
        courier.request = request;
        courier.route = [];
        const route = distance(courier, request.pickup) + distance(request.pickup, request.destination);
        courier.distance = route;
        courier.profile.totalDistance += route;
        state.totalDistance += route;
        available.splice(available.indexOf(courier), 1);
    });
}

function moveCourier(courier, delta) {
    if (!courier.request) return;
    const target = courier.status === 'to-pickup' ? courier.request.pickup : courier.request.destination;
    if (!courier.route || courier.route.length === 0) {
        setCourierRoute(courier, target);
    }

    if (!courier.route || courier.route.length === 0) {
        courier.x = target.x;
        courier.y = target.y;
        if (courier.status === 'to-pickup') {
            courier.request.pickedUpAt = state.elapsed;
            courier.status = 'delivering';
            setCourierRoute(courier, courier.request.destination);
        } else {
            courier.request.deliveredAt = state.elapsed;
            updateCourierRating(courier, courier.request);
            state.delivered += 1;
            state.requests = state.requests.filter(request => request !== courier.request);
            courier.request = null;
            courier.status = 'idle';
            courier.route = [];
        }
        return;
    }

    const next = courier.route[0];
    const dx = next.x - courier.x;
    const dy = next.y - courier.y;
    const segmentLength = Math.hypot(dx, dy);
    
    const currentNode = { x: Math.round(courier.x), y: Math.round(courier.y) };
    const nextNode = next;
    const currentEdge = getEdge(state.graph, currentNode, nextNode);
    const trafficMultiplier = currentEdge ? getEffectiveTraffic(currentEdge) : 0.2;
    const step = delta * 0.001 * (1 / trafficMultiplier);

    if (segmentLength <= step) {
        courier.x = next.x;
        courier.y = next.y;
        courier.route.shift();

        if (courier.route.length === 0) {
            if (courier.status === 'to-pickup') {
                courier.request.pickedUpAt = state.elapsed;
                courier.status = 'delivering';
                setCourierRoute(courier, courier.request.destination);
            } else {
                courier.request.deliveredAt = state.elapsed;
                updateCourierRating(courier, courier.request);
                state.delivered += 1;
                state.requests = state.requests.filter(request => request !== courier.request);
                courier.request = null;
                courier.status = 'idle';
                courier.route = [];
            }
        }
    } else {
        courier.x += (dx / segmentLength) * step;
        courier.y += (dy / segmentLength) * step;
    }
}

function updateTraffic() {
    state.graph.nodes.forEach(node => {
        const key = `${node.x},${node.y}`;
        const neighbors = state.graph.adjacency.get(key) ?? [];

        neighbors.forEach(edge => {
            const corridorPulse = (edge.x === 3 || edge.x === 8 || edge.y === 2 || edge.y === 5) ? 0.45 : 0;
            const centerPulse = (node.x >= 4 && node.x <= 7 && node.y >= 2 && node.y <= 5) ? 0.3 : 0;
            const wave = Math.sin((state.elapsed * 1.8) + (node.x * 1.7) + (edge.y * 1.1)) * 0.35;
            edge.traffic = Math.max(0, Math.min(1.2, 0.1 + wave + corridorPulse + centerPulse));
        });
    });

    recomputeEdgeWeights(state.graph);
}

function update(delta) {
    state.elapsed += delta / 1000;
    updateTraffic();
    if (state.elapsed > 0 && state.elapsed % demandDelay() < delta / 1000) spawnRequest();
    state.requests.forEach(request => { request.age += delta / 1000; });
    state.couriers.forEach(courier => { if (courier.status !== 'idle') moveCourier(courier, delta); });
    assignRequests();
    updateMetrics();
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
        context.fillRect(depotPoint.x - 11, depotPoint.y - 11, 22, 22);
        context.fillStyle = '#fffdf8';
        context.fillRect(depotPoint.x - 4, depotPoint.y - 4, 8, 8);
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
        context.arc(destination.x, destination.y, 6, 0, Math.PI * 2);
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
    const waiting = state.requests.filter(request => !request.assigned).length;
    const avgWait = state.requests.filter(request => !request.assigned).length > 0
        ? (state.requests.filter(request => !request.assigned).reduce((sum, r) => sum + r.age, 0) / waiting).toFixed(1)
        : '0.0';
    
    const activeEtas = state.couriers
        .filter(c => c.request && c.status === 'to-pickup')
        .map(c => estimateArrival(c, c.request.pickup));
    const avgEta = activeEtas.length > 0
        ? (activeEtas.reduce((a, b) => a + b, 0) / activeEtas.length).toFixed(0)
        : '0';
    
    document.querySelector('#delivered').textContent = state.delivered;
    document.querySelector('#waiting').textContent = waiting;
    document.querySelector('#distance').textContent = state.delivered ? (state.totalDistance / state.delivered).toFixed(1) : '0.0';
    document.querySelector('#waitTime').textContent = avgWait + 's';
    document.querySelector('#eta').textContent = avgEta + 's';
    const efficiency = Math.max(0, Math.round(100 - waiting * 4));
    document.querySelector('#efficiency').textContent = `${efficiency}%`;
    renderFleet();
    const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
    document.querySelector('#clock').textContent = `${minutes}:${seconds}`;
    document.querySelector('#timelineFill').style.transform = `scaleX(${Math.min(state.elapsed / 180, 1)})`;
}

function estimateArrival(courier, target) {
    if (!courier.request) return 0;
    const route = shortestPath(state.graph, { x: Math.round(courier.x), y: Math.round(courier.y) }, target);
    let time = 0;
    for (let i = 0; i < route.length - 1; i++) {
        const edge = getEdge(state.graph, route[i], route[i + 1]);
        const traffic = edge ? getEffectiveTraffic(edge) : 0.2;
        time += (edge ? (edge.weight ?? 1) : 1) * traffic * 222;
    }
    return time;
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
                <span>${result.pickupTime}s pickup</span>
                <span>${result.rating} rating</span>
            </div>
        `).join('');
}

function recordResult() {
    const completedCouriers = state.couriers.filter(courier => courier.profile.completedOrders > 0);
    const completedOrders = state.delivered;
    const pickupTime = completedCouriers.reduce((total, courier) => total + courier.profile.totalPickupTime, 0);
    const averageRating = completedCouriers.length > 0
        ? completedCouriers.reduce((total, courier) => total + courier.profile.rating, 0) / completedCouriers.length
        : 0;

    experimentResults.push({
        algorithm: algorithmInput.options[algorithmInput.selectedIndex].text,
        delivered: completedOrders,
        pickupTime: completedOrders > 0 ? (pickupTime / completedOrders).toFixed(1) : '0.0',
        rating: averageRating.toFixed(1)
    });
    renderResults();
    statusLine.textContent = 'Run recorded for strategy comparison.';
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
    assignRequests();
    draw();
});
demandInput.addEventListener('input', () => {
    document.querySelector('#demandValue').textContent = ['Low', 'Medium', 'High'][Number(demandInput.value) - 1];
});
courierInput.addEventListener('input', () => {
    document.querySelector('#courierValue').textContent = `${courierInput.value} riders`;
    reset();
});
playButton.addEventListener('click', toggleRunning);
resetButton.addEventListener('click', reset);
document.querySelector('#recordButton').addEventListener('click', recordResult);
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
    const destination = randomStation(pickup);
    addRequest(pickup, destination);
});
window.addEventListener('resize', resizeCanvas);
state = createState();
resizeCanvas();
updateMetrics();
renderResults();
animationFrame = requestAnimationFrame(frame);
