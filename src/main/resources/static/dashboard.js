const STORAGE_KEY = 'dispatchlab.latest-experiment';
const labels = {
    first_available: 'First available',
    independent: 'Independent acceptance',
    self_selection: 'Self-selection + bonus',
    traffic: 'Traffic-aware dispatch',
    nearest: 'Nearest courier'
};
const tones = ['teal', 'yellow', 'blue', 'coral'];

function readSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
        return null;
    }
}

function labelFor(algorithm) {
    const key = String(algorithm).toLowerCase();
    if (key.includes('self-selection')) return labels.self_selection;
    if (key.includes('independent')) return labels.independent;
    if (key.includes('traffic')) return labels.traffic;
    if (key.includes('first available')) return labels.first_available;
    return labels[algorithm] || algorithm;
}

function isStrategy(result, strategy) {
    const key = String(result.algorithm).toLowerCase();
    return key.includes(strategy.replace('_', '-')) || (strategy === 'traffic' && key.includes('traffic-aware'));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function bestOf(results, metric, higher = true) {
    return [...results].sort((a, b) => higher ? b[metric] - a[metric] : a[metric] - b[metric])[0];
}

function render(snapshot) {
    const empty = document.querySelector('#dashboardEmpty');
    const content = document.querySelector('#dashboardContent');
    if (!snapshot?.results?.length) {
        empty.hidden = false;
        content.hidden = true;
        return;
    }

    const results = snapshot.results;
    const throughput = bestOf(results, 'delivered');
    const service = bestOf(results, 'serviceLevel');
    const fastest = bestOf(results, 'p95DeliveryTime', false);
    const efficient = bestOf(results, 'utilization');
    const maxDelivered = Math.max(...results.map(result => result.delivered), 1);
    const maxPending = Math.max(...results.map(result => result.pending), 1);

    document.querySelector('#dashboardContext').innerHTML = `
        <span><strong>SEED</strong> ${snapshot.seed}</span>
        <span><strong>FLEET</strong> ${snapshot.courierCount} couriers</span>
        <span><strong>RUN</strong> ${Math.round(snapshot.durationSeconds / 60)} minutes</span>
        <span><strong>DEMAND</strong> ${['', 'Low', 'Medium', 'High'][snapshot.demand] || 'Custom'}</span>
        <span><strong>SAVED</strong> ${new Date(snapshot.savedAt).toLocaleString()}</span>
    `;
    document.querySelector('#dashboardKpis').innerHTML = [
        ['Top throughput', throughput.delivered, labelFor(throughput.algorithm), 'teal'],
        ['Best service level', `${service.serviceLevel.toFixed(0)}%`, labelFor(service.algorithm), 'yellow'],
        ['Fastest P95', `${fastest.p95DeliveryTime.toFixed(0)}s`, labelFor(fastest.algorithm), 'blue'],
        ['Best fleet use', `${efficient.utilization.toFixed(0)}%`, labelFor(efficient.algorithm), 'coral']
    ].map(([title, value, note, tone]) => `
        <article class="dashboard-kpi dashboard-kpi-${tone}">
            <span>${title}</span><strong>${value}</strong><small>${escapeHtml(note)}</small>
        </article>
    `).join('');

    document.querySelector('#throughputChart').innerHTML = results.map((result, index) => `
        <div class="bar-row">
            <div class="bar-label"><strong>${escapeHtml(labelFor(result.algorithm))}</strong><span>${result.delivered} delivered</span></div>
            <div class="bar-track"><span class="bar-fill bar-fill-${tones[index % tones.length]}" style="width:${(result.delivered / maxDelivered) * 100}%"></span></div>
        </div>
    `).join('');

    document.querySelector('#qualityChart').innerHTML = results.map(result => `
        <div class="quality-row">
            <div class="quality-label"><strong>${escapeHtml(labelFor(result.algorithm))}</strong><span>${result.serviceLevel.toFixed(0)}% SLA</span></div>
            <div class="quality-track"><span class="sla-fill" style="width:${result.serviceLevel}%"></span></div>
            <div class="quality-rating"><span>${result.p95DeliveryTime.toFixed(0)}s P95</span><strong>${result.rating.toFixed(1)}</strong></div>
        </div>
    `).join('');

    document.querySelector('#dashboardTableBody').innerHTML = results.map((result, index) => `
        <tr class="${index === results.indexOf(throughput) ? 'table-highlight' : ''}">
            <td><strong>${escapeHtml(labelFor(result.algorithm))}</strong></td>
            <td>${result.delivered}</td><td>${result.pending}</td>
            <td>${result.averageDistance.toFixed(1)}</td><td>${result.averagePickupTime.toFixed(0)}s</td>
            <td>${result.p95DeliveryTime.toFixed(0)}s</td><td>${result.serviceLevel.toFixed(0)}%</td>
            <td>${result.utilization.toFixed(0)}%</td><td>${result.rating.toFixed(1)}</td>
        </tr>
    `).join('');

    const independent = results.find(result => isStrategy(result, 'independent'));
    const selection = results.find(result => isStrategy(result, 'self_selection'));
    const traffic = results.find(result => isStrategy(result, 'traffic'));
    const insights = [
        `${labelFor(throughput.algorithm)} leads throughput with ${throughput.delivered} completed orders.`,
        selection && independent
            ? `Self-selection delivers ${selection.delivered - independent.delivered >= 0 ? '+' : ''}${selection.delivered - independent.delivered} orders versus independent acceptance.`
            : 'The selected run does not include both autonomous strategies.',
        traffic && selection
            ? `Traffic-aware dispatch completes ${traffic.delivered - selection.delivered} more orders than self-selection, trading away fleet utilization.`
            : `The strongest service-level result is ${service.serviceLevel.toFixed(0)}% from ${labelFor(service.algorithm)}.`
    ];
    document.querySelector('#insightList').innerHTML = insights.map(text => `<p><span>+</span>${escapeHtml(text)}</p>`).join('');
    empty.hidden = true;
    content.hidden = false;
}

document.querySelector('#exportDashboardButton').addEventListener('click', () => {
    const snapshot = readSnapshot();
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dispatchlab-analysis-${snapshot.seed}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
});

render(readSnapshot());
