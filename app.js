const state = {
    currentTab: 'today',
    data: { today: null, tomorrow: null },
    chartInstance: null
};

const fmtNum = (num) => num.toFixed(2).replace('.', ',');
const fmtH = (h) => `${h.toString().padStart(2, '0')}:00`;

function getHelsinkiDate(offsetDays = 0) {
    const now = new Date();
    const helsinkiStr = now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" });
    const hDate = new Date(helsinkiStr);
    hDate.setDate(hDate.getDate() + offsetDays);
    return hDate;
}

async function fetchPrices(offsetDays) {
    const date = getHelsinkiDate(offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const url = `https://www.sahkonhintatanaan.fi/api/v1/prices/${year}/${month}-${day}.json`;

    console.log(`[API CALL] Haetaan dataa: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[API VAROITUS] Dataa ei saatavilla päivälle: ${day}.${month}.${year}`);
            return null;
        }
        const data = await response.json();
        return data.map((item, index) => ({
            hour: index,
            price: item.EUR_per_kWh * 100 * 1.255
        }));
    } catch (error) {
        console.error("[API VIRHE] Verkkovirhe tai CORS-ongelma:", error);
        return null;
    }
}

function updateUI() {
    console.log("[UI] Päivitetään näkymä, aktiivinen välilehti:", state.currentTab);
    
    const isToday = state.currentTab === 'today';
    const dataToDisplay = isToday ? state.data.today : state.data.tomorrow;

    // Reset messages
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('error-today').classList.add('hidden');
    document.getElementById('error-tomorrow').classList.add('hidden');

    // Handle missing data
    if (!dataToDisplay || dataToDisplay.length === 0) {
        document.getElementById('dashboard-content').classList.add('hidden');
        if (isToday) {
            document.getElementById('error-today').classList.remove('hidden');
        } else {
            document.getElementById('error-tomorrow').classList.remove('hidden');
        }
        return;
    }

    // Show dashboard
    document.getElementById('dashboard-content').classList.remove('hidden');

    const now = getHelsinkiDate();
    const currentHour = now.getHours();

    // Card 1: Hinta Nyt
    const cardNow = document.getElementById('card-now');
    if (isToday) {
        cardNow.style.display = 'flex';
        const currentData = dataToDisplay.find(d => d.hour === currentHour);
        if (currentData) {
            document.getElementById('time-now').innerText = `${fmtH(currentHour)} - ${fmtH((currentHour + 1) % 24)}`;
            document.getElementById('val-now').innerHTML = `${fmtNum(currentData.price)} <span class="unit">c/kWh</span>`;
        }
    } else {
        cardNow.style.display = 'none';
    }

    // Card 2 & 3: Stats
    let sum = 0, min = Infinity, max = -Infinity;
    let minH = 0, maxH = 0;

    dataToDisplay.forEach(d => {
        sum += d.price;
        if (d.price < min) { min = d.price; minH = d.hour; }
        if (d.price > max) { max = d.price; maxH = d.hour; }
    });

    document.getElementById('val-avg').innerHTML = `${fmtNum(sum / dataToDisplay.length)} <span class="unit">c/kWh</span>`;
    document.getElementById('val-min').innerText = fmtNum(min);
    document.getElementById('time-min').innerText = `${fmtH(minH)} - ${fmtH((minH + 1) % 24)}`;
    document.getElementById('val-max').innerText = fmtNum(max);
    document.getElementById('time-max').innerText = `${fmtH(maxH)} - ${fmtH((maxH + 1) % 24)}`;

    // Chart Title
    const dateObj = getHelsinkiDate(isToday ? 0 : 1);
    document.getElementById('chart-title').innerText = isToday ? `Tuntihinnat Tänään (${dateObj.toLocaleDateString('fi-FI')})` : `Tuntihinnat Huomenna (${dateObj.toLocaleDateString('fi-FI')})`;

    renderChart(dataToDisplay, isToday ? currentHour : -1);
}

function renderChart(data, highlightHour) {
    if (!window.Chart) {
        console.error("[CHART VIRHE] Chart.js kirjastoa ei löytynyt!");
        return;
    }

    const ctx = document.getElementById('priceChart').getContext('2d');
    if (state.chartInstance) state.chartInstance.destroy();

    const colors = data.map(d => {
        if (d.hour === highlightHour) return '#2563eb';
        if (d.price > 15) return '#fca5a5';
        if (d.price < 5) return '#86efac';
        return '#cbd5e1';
    });

    state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => fmtH(d.hour)),
            datasets: [{
                data: data.map(d => d.price.toFixed(2)),
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14, family: 'Inter' },
                    bodyFont: { size: 14, family: 'Inter', weight: 'bold' },
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (ctx) => `klo ${ctx[0].label} - ${fmtH((parseInt(ctx[0].label) + 1) % 24)}`,
                        label: (ctx) => `${ctx.parsed.y.toFixed(2).replace('.', ',')} c/kWh`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter' } } },
                y: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { family: 'Inter' } }, beginAtZero: true }
            }
        }
    });
}

window.switchTab = function(tab) {
    state.currentTab = tab;
    document.getElementById('btn-today').classList.toggle('active', tab === 'today');
    document.getElementById('btn-tomorrow').classList.toggle('active', tab === 'tomorrow');
    updateUI();
};

async function init() {
    console.log("[APP START] Alustetaan sovellus...");
    const [todayData, tomorrowData] = await Promise.all([ fetchPrices(0), fetchPrices(1) ]);
    state.data.today = todayData;
    state.data.tomorrow = tomorrowData;
    updateUI();
}

document.addEventListener('DOMContentLoaded', init);
