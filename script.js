/**
 * Sähkötänään.fi - Pörssisähkön Kojelauta
 * Tämä tiedosto käsittelee datan haun, tilastojen laskennan ja kaavion piirtämisen.
 */

// Sovelluksen tila (State)
const state = {
    currentTab: 'today', // Oletuksena näytetään kuluva päivä ('today' tai 'tomorrow')
    data: { today: null, tomorrow: null },
    chartInstance: null
};

// ==========================================================================
// Apufunktiot
// ==========================================================================

// Muotoilee numerot suomalaiseen muotoon (esim. 5.12 -> 5,12)
const fmtNum = (num) => num.toFixed(2).replace('.', ',');

// Muotoilee tunnin muotoon HH:00 (esim. 8 -> 08:00)
const fmtH = (h) => `${h.toString().padStart(2, '0')}:00`;

// Palauttaa oikean päivämäärän ja ajan Suomen aikavyöhykkeellä (Helsinki)
// offsetDays: 0 = tänään, 1 = huomenna
function getHelsinkiDate(offsetDays = 0) {
    const now = new Date();
    // Pakotetaan aikavyöhyke Helsinkiin, jotta sovellus toimii oikein missä tahansa
    const helsinkiStr = now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" });
    const hDate = new Date(helsinkiStr);
    hDate.setDate(hDate.getDate() + offsetDays);
    return hDate;
}

// ==========================================================================
// Datan haku (API)
// ==========================================================================

async function fetchPrices(offsetDays) {
    const date = getHelsinkiDate(offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // sahkonhintatanaan.fi API-osoite
    const url = `https://www.sahkonhintatanaan.fi/api/v1/prices/${year}/${month}-${day}.json`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null; // Palauttaa null, jos dataa ei ole vielä julkaistu
        
        const data = await response.json();
        
        // Käsittele data: Muuta eurot senteiksi ja lisää Suomen ALV (25,5 %)
        return data.map((item, index) => ({
            hour: index,
            price: item.EUR_per_kWh * 100 * 1.255
        }));
    } catch (error) {
        console.error("Virhe haettaessa sähkön hintoja:", error);
        return null;
    }
}

// ==========================================================================
// Käyttöliittymän päivitys (UI)
// ==========================================================================

function updateUI() {
    const isToday = state.currentTab === 'today';
    const dataToDisplay = isToday ? state.data.today : state.data.tomorrow;

    // Piilota latausilmoitus
    document.getElementById('loader').classList.add('hidden');

    // Tarkista, onko huomisen dataa olemassa
    if (!dataToDisplay || dataToDisplay.length === 0) {
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('error-tomorrow').classList.remove('hidden');
        return;
    }

    // Näytä sisältö ja piilota virheet
    document.getElementById('error-tomorrow').classList.add('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');

    const now = getHelsinkiDate();
    const currentHour = now.getHours();

    // 1. Päivitä "Hinta Nyt" -kortti (Näytetään vain Tänään-välilehdellä)
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

    // 2. Laske Päivän Tilastot (Keskiarvo, Alin, Ylin)
    let sum = 0, min = Infinity, max = -Infinity;
    let minH = 0, maxH = 0;

    dataToDisplay.forEach(d => {
        sum += d.price;
        if (d.price < min) { min = d.price; minH = d.hour; }
        if (d.price > max) { max = d.price; maxH = d.hour; }
    });

    // Päivitä DOM-elementit
    document.getElementById('val-avg').innerHTML = `${fmtNum(sum / dataToDisplay.length)} <span class="unit">c/kWh</span>`;
    document.getElementById('val-min').innerText = fmtNum(min);
    document.getElementById('time-min').innerText = `${fmtH(minH)} - ${fmtH((minH + 1) % 24)}`;
    document.getElementById('val-max').innerText = fmtNum(max);
    document.getElementById('time-max').innerText = `${fmtH(maxH)} - ${fmtH((maxH + 1) % 24)}`;

    // Päivitä Kaavion otsikko (Lisätään päivämäärä)
    const dateObj = getHelsinkiDate(isToday ? 0 : 1);
    const dateStr = dateObj.toLocaleDateString('fi-FI');
    document.getElementById('chart-title').innerText = isToday ? `Tuntihinnat Tänään (${dateStr})` : `Tuntihinnat Huomenna (${dateStr})`;

    // 3. Piirrä Chart.js -kaavio
    renderChart(dataToDisplay, isToday ? currentHour : -1);
}

// ==========================================================================
// Kaavion Piirtäminen (Chart.js)
// ==========================================================================

function renderChart(data, highlightHour) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    // Tuhoa vanha kaavio, jotta uusi ei piirry sen päälle (bugien välttäminen)
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    // Määritä kaavion palkkien värit dynaamisesti hinnan mukaan
    const colors = data.map(d => {
        if (d.hour === highlightHour) return '#2563eb'; // Kuluva tunti (Sininen)
        if (d.price > 15) return '#fca5a5';             // Erittäin kallis (Punainen)
        if (d.price < 5) return '#86efac';              // Erittäin halpa (Vihreä)
        return '#cbd5e1';                               // Normaali hinta (Harmaa)
    });

    // Luo uusi Chart.js -instanssi
    state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => fmtH(d.hour)),
            datasets: [{
                label: 'Hinta (c/kWh)',
                data: data.map(d => d.price.toFixed(2)),
                backgroundColor: colors,
                borderRadius: 4, // Pyöristetyt kulmat palkeille
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Piilota selite
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14, family: 'Inter' },
                    bodyFont: { size: 14, family: 'Inter', weight: 'bold' },
                    padding: 12,
                    displayColors: false, // Piilota värineliö tooltipistä
                    callbacks: {
                        // Muotoile tooltip ymmärrettäväksi suomeksi
                        title: (ctx) => `klo ${ctx[0].label} - ${fmtH((parseInt(ctx[0].label) + 1) % 24)}`,
                        label: (ctx) => `${ctx.parsed.y.toFixed(2).replace('.', ',')} c/kWh`
                    }
                }
            },
            scales: {
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#64748b', font: { family: 'Inter' } } 
                },
                y: { 
                    grid: { color: '#f1f5f9' }, 
                    ticks: { color: '#64748b', font: { family: 'Inter' } }, 
                    beginAtZero: true 
                }
            }
        }
    });
}

// ==========================================================================
// Sovelluksen Ohjaus
// ==========================================================================

// Välilehden vaihto (Kutsutaan HTML-napista onClick-eventillä)
window.switchTab = function(tab) {
    state.currentTab = tab;
    
    // Päivitä nappien aktiivinen tila visuaalisesti
    document.getElementById('btn-today').classList.toggle('active', tab === 'today');
    document.getElementById('btn-tomorrow').classList.toggle('active', tab === 'tomorrow');
    
    updateUI();
};

// Sovelluksen alustus käynnistyksessä
async function init() {
    // Hae molempien päivien data samanaikaisesti rinnakkain (nopeampi lataus)
    const [todayData, tomorrowData] = await Promise.all([
        fetchPrices(0),
        fetchPrices(1)
    ]);

    state.data.today = todayData;
    state.data.tomorrow = tomorrowData;

    updateUI();
}

// Käynnistä sovellus, kun HTML-dokumentti on kokonaan ladattu
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Päivitä data automaattisesti 15 minuutin välein
    // Tämä varmistaa, että "Hinta Nyt" ja sininen palkki siirtyvät oikeaan aikaan, 
    // jos käyttäjä jättää sivun auki koko päiväksi.
    setInterval(init, 900000); 
});F
