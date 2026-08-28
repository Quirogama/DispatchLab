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
const grid = { columns: 12, rows: 8 };
const depots = [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 2, y: 6 }, { x: 9, y: 6 }];
const requestColors = ['#e5684c', '#f09b52', '#c94f59'];
const algorithmNotes = {
    nearest: 'Minimizes grid distance from courier to pickup.',
    priority: 'Serves urgent requests before optimizing distance.',
    balanced: 'Spreads work across the fleet to avoid overload.'
};
let state;
let lastFrame = 0;
let animationFrame;

function randomStation(exclude) {
    let station;
    do {
        station = { x: 1 + Math.floor(Math.random() * 10), y: 1 + Math.floor(Math.random() * 6) };
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
        requests: [],
        couriers: Array.from({ length: courierCount }, (_, index) => ({
            id: index,
            x: depots[index % depots.length].x,
            y: depots[index % depots.length].y,
            home: { ...depots[index % depots.length] },
            status: 'idle',
            request: null,
            distance: 0
        }))
    };
}

function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function demandDelay() { return [2.8, 1.7, 0.85][Number(demandInput.value) - 1]; }

function addRequest(station) {
    const destination = randomStation(station);
    state.requests.push({ id: Date.now() + Math.random(), pickup: station, destination, priority: 1 + Math.floor(Math.random() * 3), age: 0, color: requestColors[Math.floor(Math.random() * requestColors.length)] });
    statusLine.textContent = 'New delivery request added to the queue.';
    assignRequests();
    draw();
}

function spawnRequest() {
    if (state.requests.length > 10) return;
    addRequest(randomStation());
}

function chooseCourier(request, available) {
    if (algorithmInput.value === 'priority') available.sort((a, b) => b.priority - a.priority);
    if (algorithmInput.value === 'balanced') available.sort((a, b) => a.distance - b.distance);
    return available.sort((a, b) => distance(a, request.pickup) - distance(b, request.pickup))[0];
}

function assignRequests() {
    const available = state.couriers.filter(courier => courier.status === 'idle');
    state.requests.filter(request => !request.assigned).sort((a, b) => b.priority - a.priority).forEach(request => {
        const courier = chooseCourier(request, available);
        if (!courier) return;
        request.assigned = courier.id;
        courier.status = 'to-pickup';
        courier.request = request;
        const route = distance(courier, request.pickup) + distance(request.pickup, request.destination);
        courier.distance = route;
        state.totalDistance += route;
        available.splice(available.indexOf(courier), 1);
    });
}

function moveCourier(courier, delta) {
    const target = courier.status === 'to-pickup' ? courier.request.pickup : courier.request.destination;
    const step = delta * 0.0028;
    const dx = target.x - courier.x;
    const dy = target.y - courier.y;
    const length = Math.hypot(dx, dy);
    if (length < step) {
        courier.x = target.x;
        courier.y = target.y;
        if (courier.status === 'to-pickup') courier.status = 'delivering';
        else {
            state.delivered += 1;
            state.requests = state.requests.filter(request => request !== courier.request);
            courier.request = null;
            courier.status = 'idle';
        }
    } else {
        courier.x += (dx / length) * step;
        courier.y += (dy / length) * step;
    }
}

function update(delta) {
    state.elapsed += delta / 1000;
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
    canvas.height = bounds.width * 0.58 * ratio;
    canvas.style.height = `${bounds.width * 0.58}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
}

function point(station, width, height) { return { x: (station.x + 0.5) * width / grid.columns, y: (station.y + 0.5) * height / grid.rows }; }
function roundedRect(x, y, width, height, radius) { context.beginPath(); context.roundRect(x, y, width, height, radius); }

function draw() {
    const width = canvas.clientWidth;
    const height = width * 0.58;
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
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
        context.globalAlpha = 0.35;
        context.setLineDash([4, 5]);
        context.lineWidth = 2;
        context.beginPath(); context.moveTo(pickup.x, pickup.y); context.lineTo(destination.x, destination.y); context.stroke();
        context.setLineDash([]); context.globalAlpha = 1;
        context.fillStyle = request.color;
        context.fillRect(pickup.x - 8, pickup.y - 8, 16, 16);
        context.fillStyle = '#fffdf8';
        context.fillRect(destination.x - 5, destination.y - 5, 10, 10);
    });
    state.couriers.forEach(courier => {
        const courierPoint = point(courier, width, height);
        context.fillStyle = '#4e7cc1';
        context.beginPath(); context.arc(courierPoint.x, courierPoint.y, 7, 0, Math.PI * 2); context.fill();
        context.strokeStyle = '#fffdf8'; context.lineWidth = 2; context.stroke();
    });
}

function updateMetrics() {
    const waiting = state.requests.filter(request => !request.assigned).length;
    document.querySelector('#delivered').textContent = state.delivered;
    document.querySelector('#waiting').textContent = waiting;
    document.querySelector('#distance').textContent = state.delivered ? (state.totalDistance / state.delivered).toFixed(1) : '0.0';
    const efficiency = Math.max(0, Math.round(100 - waiting * 4));
    document.querySelector('#efficiency').textContent = `${efficiency}%`;
    const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
    document.querySelector('#clock').textContent = `${minutes}:${seconds}`;
    document.querySelector('#timelineFill').style.transform = `scaleX(${Math.min(state.elapsed / 180, 1)})`;
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

algorithmInput.addEventListener('change', () => { algorithmNote.textContent = algorithmNotes[algorithmInput.value]; assignRequests(); draw(); });
demandInput.addEventListener('input', () => { document.querySelector('#demandValue').textContent = ['Low', 'Medium', 'High'][Number(demandInput.value) - 1]; });
courierInput.addEventListener('input', () => { document.querySelector('#courierValue').textContent = `${courierInput.value} riders`; reset(); });
playButton.addEventListener('click', toggleRunning);
resetButton.addEventListener('click', reset);
canvas.addEventListener('click', event => { const bounds = canvas.getBoundingClientRect(); addRequest({ x: Math.max(1, Math.min(10, Math.floor((event.clientX - bounds.left) / bounds.width * grid.columns))), y: Math.max(1, Math.min(6, Math.floor((event.clientY - bounds.top) / bounds.height * grid.rows))) }); });
window.addEventListener('resize', resizeCanvas);
state = createState();
resizeCanvas();
updateMetrics();
animationFrame = requestAnimationFrame(frame);
