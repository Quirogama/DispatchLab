import { t } from './i18n.js?v=20261125-1';

const STORAGE_KEY = 'dispatchlab.latest-experiment';
const labels = {
    first_available: 'Naive: first available courier',
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
    if (key.includes('self-selection')) return t(labels.self_selection);
    if (key.includes('independent')) return t(labels.independent);
    if (key.includes('traffic')) return t(labels.traffic);
    if (key.includes('first available')) return t(labels.first_available);
    return t(labels[algorithm] || algorithm);
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

    const results = snapshot.results.map(result => {
        const courierHours = (result.couriers ?? snapshot.courierCount) *
            snapshot.durationSeconds / 3600;
        return {
            ...result,
            fleetThroughput: result.fleetThroughput ??
                (courierHours > 0 ? result.delivered / courierHours : 0)
        };
    });
    const throughput = bestOf(results, 'delivered');
    const service = bestOf(results, 'serviceLevel');
    const fastest = bestOf(results, 'p95DeliveryTime', false);
    const efficient = bestOf(results, 'fleetThroughput');
    const maxDelivered = Math.max(...results.map(result => result.delivered), 1);
    const maxPending = Math.max(...results.map(result => result.pending), 1);
    const outcomeTotal = results.reduce((total, result) => total + result.delivered, 0);
    const outcomeColors = ['var(--teal)', 'var(--yellow)', 'var(--blue)', 'var(--coral)'];
    let outcomeStart = 0;
    const outcomeSegments = results.map((result, index) => {
        const share = outcomeTotal > 0 ? (result.delivered / outcomeTotal) * 100 : 0;
        const segment = `${outcomeColors[index % outcomeColors.length]} ${outcomeStart}% ${outcomeStart + share}%`;
        outcomeStart += share;
        return { result, segment, share };
    });

    document.querySelector('#dashboardContext').innerHTML = `
        <span><strong>SEED</strong> ${snapshot.seed}</span>
        <span><strong>FLEET</strong> ${snapshot.courierCount} ${t('riders')}</span>
        <span><strong>RUN</strong> ${Math.round(snapshot.durationSeconds / 60)} ${t('minutes')}</span>
        <span><strong>DEMAND</strong> ${t(['', 'Low', 'Medium', 'High'][snapshot.demand] || 'Custom')}</span>
        <span><strong>SAVED</strong> ${new Date(snapshot.savedAt).toLocaleString()}</span>
    `;
    document.querySelector('#dashboardKpis').innerHTML = [
        [t('Top throughput'), throughput.delivered, labelFor(throughput.algorithm), 'teal'],
        [t('Best service level'), `${service.serviceLevel.toFixed(0)}%`, labelFor(service.algorithm), 'yellow'],
        [t('Fastest P95'), `${fastest.p95DeliveryTime.toFixed(0)}s`, labelFor(fastest.algorithm), 'blue'],
        [t('Best fleet throughput'), `${efficient.fleetThroughput.toFixed(1)} ${t('orders/rider-hour')}`, labelFor(efficient.algorithm), 'coral']
    ].map(([title, value, note, tone]) => `
        <article class="dashboard-kpi dashboard-kpi-${tone}">
            <span>${title}</span><strong>${value}</strong><small>${escapeHtml(note)}</small>
        </article>
    `).join('');

    document.querySelector('#throughputChart').innerHTML = results.map((result, index) => `
        <div class="bar-row">
            <div class="bar-label"><strong>${escapeHtml(labelFor(result.algorithm))}</strong><span>${result.delivered} ${t('delivered lowercase')}</span></div>
            <div class="bar-track"><span class="bar-fill bar-fill-${tones[index % tones.length]}" style="width:${(result.delivered / maxDelivered) * 100}%"></span></div>
        </div>
    `).join('');

    document.querySelector('#qualityChart').innerHTML = results.map(result => `
        <div class="quality-row">
            <div class="quality-label"><strong>${escapeHtml(labelFor(result.algorithm))}</strong><span>${result.serviceLevel.toFixed(0)}% SLA</span></div>
            <div class="quality-track"><span class="sla-fill" style="width:${result.serviceLevel}%"></span></div>
            <div class="quality-rating"><span>${result.p95DeliveryTime.toFixed(0)}s slowest 5%</span><strong>${result.rating.toFixed(1)}</strong></div>
        </div>
    `).join('');

    document.querySelector('#outcomeDonut').style.setProperty(
        '--outcome-gradient',
        outcomeSegments.map(segment => segment.segment).join(', ')
    );
    document.querySelector('#outcomeDonut').setAttribute(
        'aria-label',
        `${t('Comparison of delivered orders across')} ${results.length} ${t('dispatch strategies')}`
    );
    document.querySelector('#outcomePercent').textContent = outcomeTotal;
    document.querySelector('#outcomeLegend').innerHTML = outcomeSegments.map(({ result }, index) => `
        <div class="outcome-legend-row"><i class="legend-swatch strategy-${index % 4}"></i><span>${escapeHtml(labelFor(result.algorithm))}</span><strong>${result.delivered}</strong></div>
    `).join('') + `<p>${t('Each segment represents the orders completed by one strategy.')}</p>`;

    document.querySelector('#dashboardTableBody').innerHTML = results.map((result, index) => `
        <tr class="${index === results.indexOf(throughput) ? 'table-highlight' : ''}">
            <td><strong>${escapeHtml(labelFor(result.algorithm))}</strong></td>
            <td>${result.delivered}</td><td>${result.pending}</td>
            <td>${result.averageDistance.toFixed(1)}</td><td>${result.averagePickupTime.toFixed(0)}s</td>
            <td>${result.p95DeliveryTime.toFixed(0)}s</td><td>${result.serviceLevel.toFixed(0)}%</td>
            <td>${result.fleetThroughput.toFixed(1)} ${t('orders/rider-hour')}</td><td>${result.rating.toFixed(1)}</td>
        </tr>
    `).join('');

    const independent = results.find(result => isStrategy(result, 'independent'));
    const selection = results.find(result => isStrategy(result, 'self_selection'));
    const traffic = results.find(result => isStrategy(result, 'traffic'));
    const insights = [
        `${labelFor(throughput.algorithm)} ${t('leads throughput with')} ${throughput.delivered} ${t('completed orders')}.`,
        selection && independent
            ? `${t('Self-selection delivers')} ${selection.delivered - independent.delivered >= 0 ? '+' : ''}${selection.delivered - independent.delivered} ${t('orders versus independent acceptance')}.`
            : t('The selected run does not include both autonomous strategies.'),
        traffic && selection
            ? `${t('Traffic-aware dispatch completes')} ${traffic.delivered - selection.delivered} ${t('more orders than self-selection while keeping fleet utilization lower')}.`
            : `${t('The strongest service-level result is')} ${service.serviceLevel.toFixed(0)}% ${t('from')} ${labelFor(service.algorithm)}.`
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
document.addEventListener('dispatchlab:language', () => render(readSnapshot()));
