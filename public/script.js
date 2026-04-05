/* ═══════════════════════════════════════════
   TruthMarket — Client-Side Application Logic
   ═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    /* ── Tab Router ── */
    const tabs = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.target);
            if (target) target.classList.add('active');
        });
    });

    // Handle hash-based deep links
    const hashMap = { '#markets': 'tab-markets', '#news': 'tab-news', '#crypto': 'tab-crypto', '#analyzer': 'tab-analyzer', '#converter': 'tab-converter' };
    if (hashMap[window.location.hash]) {
        document.querySelector(`[data-target="${hashMap[window.location.hash]}"]`)?.click();
    }

    /* ── Shared State ── */
    let userPredictions = JSON.parse(localStorage.getItem('tm_preds') || '{}');
    let polymarketCache = [];

    /* ════════════════════════════════════════
       1. PREDICTION MARKETS  (/api/markets)
       ════════════════════════════════════════ */
    const polyContainer = document.getElementById('polymarket-container');
    const polyLoading = document.getElementById('markets-loading');

    async function fetchMarkets() {
        if (!polyContainer) return;
        try {
            const res = await fetch('/api/markets');
            const data = await res.json();
            polymarketCache = data;

            polyLoading?.classList.add('hidden');
            polyContainer.innerHTML = '';

            data.forEach((m, i) => {
                let yes = m.outcomes.TRUE;
                let no = m.outcomes.FAKE;

                // Apply local user vote shift
                if (userPredictions[m.id] === 'TRUE') { yes = Math.min(yes + 5, 99); no = 100 - yes; }
                if (userPredictions[m.id] === 'FAKE') { no = Math.min(no + 5, 99); yes = 100 - no; }

                const sentimentHTML = {
                    'High Contention': '<span class="sentiment-badge" style="background:rgba(245,158,11,.2);color:#fbbf24;">High Contention</span>',
                    'Strong Consensus': '<span class="sentiment-badge" style="background:var(--truth-bg);color:var(--truth-color);">Strong Consensus</span>',
                    'Strong Resistance': '<span class="sentiment-badge" style="background:var(--fake-bg);color:var(--fake-color);">Strong Resistance</span>'
                }[m.sentiment] || '';

                const card = document.createElement('div');
                card.className = 'market-card';
                card.innerHTML = `
                    <div class="market-stats-top">
                        <span><i class="fa-solid fa-clock"></i> Polymarket</span>
                        <span class="font-bold">Vol: ${m.volume}</span>
                    </div>
                    <h3 class="market-title">${m.question}</h3>
                    <div>${sentimentHTML}</div>
                    <div class="prob-labels mt-sm">
                        <span class="text-truth">YES ${yes}%</span>
                        <span class="text-fake">NO ${no}%</span>
                    </div>
                    <div class="card-bar">
                        <div class="card-bar-fill bg-truth" style="width:${yes}%"></div>
                        <div class="card-bar-fill bg-fake" style="width:${no}%"></div>
                    </div>
                    <div class="trade-buttons">
                        <button class="trade-btn trade-true" onclick="makePrediction('${m.id}','TRUE')">Trade YES <span>${yes}¢</span></button>
                        <button class="trade-btn trade-fake" onclick="makePrediction('${m.id}','FAKE')">Trade NO <span>${no}¢</span></button>
                    </div>`;
                polyContainer.appendChild(card);
            });
        } catch (e) {
            console.error('Markets fetch failed:', e);
            if (polyLoading) polyLoading.innerHTML = '<div class="text-fake p-md">Failed to connect to /api/markets</div>';
        }
    }

    window.makePrediction = (id, outcome) => {
        userPredictions[id] = outcome;
        localStorage.setItem('tm_preds', JSON.stringify(userPredictions));
        fetchMarkets();
    };

    if (polyContainer) fetchMarkets();

    /* ════════════════════════════════════════
       2. NEWS INTELLIGENCE  (/api/news)
       ════════════════════════════════════════ */
    const newsContainer = document.getElementById('news-container');
    const newsLoading = document.getElementById('news-loading');

    window.loadNews = async function (category) {
        if (!newsContainer) return;
        newsContainer.innerHTML = '';
        newsLoading?.classList.remove('hidden');

        // Toggle active filter button
        document.querySelectorAll('#tab-news .filter-btn').forEach(b => b.classList.remove('active'));
        if (event?.currentTarget) event.currentTarget.classList.add('active');

        try {
            const res = await fetch(`/api/news?category=${category}`);
            const data = await res.json();
            newsLoading?.classList.add('hidden');

            data.forEach(item => {
                const score = item.credibilityScore;
                const cls = score >= 75 ? 'score-high' : score > 50 ? 'score-med' : 'score-low';
                const hours = item.publishedAt ? Math.round((Date.now() - new Date(item.publishedAt).getTime()) / 3600000) : '?';

                const el = document.createElement('div');
                el.className = 'news-item';
                el.innerHTML = `
                    <div class="news-content">
                        <span class="news-source">${item.source}</span>
                        <div class="news-title">${item.title}</div>
                        <div class="news-date">${hours}h ago</div>
                    </div>
                    <div class="news-score ${cls}">${score}<span>Score</span></div>`;

                el.addEventListener('click', () => {
                    document.querySelector('[data-target="tab-analyzer"]').click();
                    document.getElementById('ai-input').value = item.title;
                    document.getElementById('ai-analyze-btn').click();
                });

                newsContainer.appendChild(el);
            });
        } catch (e) {
            console.error('News fetch failed:', e);
            if (newsLoading) newsLoading.innerHTML = '<div class="text-fake">Failed to connect to /api/news</div>';
        }
    };

    document.querySelector('[data-target="tab-news"]')?.addEventListener('click', () => {
        if (!newsContainer?.innerHTML) loadNews('general');
    });

    /* ════════════════════════════════════════
       3. FAKE NEWS ANALYZER (client-side)
       ════════════════════════════════════════ */
    const analyzerBtn = document.getElementById('ai-analyze-btn');
    const analyzerInput = document.getElementById('ai-input');
    const analyzerResult = document.getElementById('ai-result');

    analyzerBtn?.addEventListener('click', () => {
        const text = analyzerInput.value.trim();
        if (!text) return;

        analyzerBtn.disabled = true;
        analyzerBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Running…';
        analyzerResult.classList.add('hidden');

        setTimeout(() => {
            const triggers = ['shocking', 'breaking', 'secret', 'exposed', 'insane', 'scandal', 'leaked', 'you won\'t believe'];
            let score = 85;
            let flags = 0;
            triggers.forEach(w => { if (new RegExp(`\\b${w}\\b`, 'gi').test(text)) { score -= 25; flags++; } });
            score = Math.max(5, Math.min(score, 99));

            let tag, cls, reason;
            if (score >= 70) { tag = 'REAL'; cls = 'tag-real'; reason = 'High probability of authenticity. No hyperbolic modifiers detected.'; }
            else if (score >= 40) { tag = 'UNCERTAIN'; cls = 'tag-uncertain'; reason = `Detected ${flags} flagged keyword(s). Content may be sensationalized.`; }
            else { tag = 'FAKE / CLICKBAIT'; cls = 'tag-fake'; reason = `Critical: ${flags} manipulation keyword(s) detected. Exercise extreme caution.`; }

            document.getElementById('ai-tag').innerText = tag;
            document.getElementById('ai-tag').className = `prediction-tag ${cls}`;
            document.getElementById('ai-score').innerText = `${score}%`;

            const meter = document.getElementById('ai-meter');
            meter.style.background = score >= 70 ? 'var(--truth-color)' : score >= 40 ? '#fbbf24' : 'var(--fake-color)';
            meter.style.width = '0%';
            document.getElementById('ai-reasoning').innerText = reason;
            analyzerResult.classList.remove('hidden');
            requestAnimationFrame(() => { meter.style.width = `${score}%`; });

            // Polymarket correlation
            const words = text.toLowerCase().split(' ').filter(w => w.length > 4);
            const match = polymarketCache.find(m => words.some(w => m.question.toLowerCase().includes(w)));
            const corrBox = document.getElementById('ai-correlation');
            if (match) {
                document.getElementById('ai-correlation-text').innerHTML = `Correlated Market: <strong>"${match.question}"</strong>`;
                corrBox.classList.remove('hidden');
            } else { corrBox.classList.add('hidden'); }

            analyzerBtn.disabled = false;
            analyzerBtn.innerHTML = 'Compute Verdict <i class="fa-solid fa-microchip"></i>';
        }, 1500);
    });

    /* ════════════════════════════════════════
       4. CRYPTO INTELLIGENCE  (/api/crypto)
       ════════════════════════════════════════ */
    const cryptoLoading = document.getElementById('crypto-loading');
    const cryptoContent = document.getElementById('crypto-content');
    const cryptoList = document.getElementById('crypto-list-container');
    let cryptoChart = null;
    let cryptoData = null;

    async function fetchCrypto() {
        if (!cryptoContent) return;
        try {
            const res = await fetch('/api/crypto');
            cryptoData = await res.json();

            cryptoLoading?.classList.add('hidden');
            cryptoContent.classList.remove('hidden');
            cryptoList.innerHTML = '';

            cryptoData.forEach(c => {
                const color = c.change24h >= 0 ? 'text-truth' : 'text-fake';
                const row = document.createElement('div');
                row.className = 'crypto-row';
                row.innerHTML = `
                    <div class="coin-identity">
                        <img src="${c.image}" alt="${c.symbol}">
                        <div><div class="coin-name">${c.name}</div><div class="coin-symbol">${c.symbol}</div></div>
                    </div>
                    <div class="coin-price-data">
                        <div class="coin-price">$${c.price.toLocaleString()}</div>
                        <div class="coin-change ${color}">${c.change24h.toFixed(2)}%</div>
                    </div>`;
                cryptoList.appendChild(row);
            });

            // Populate chart dropdown
            const sel = document.getElementById('crypto-chart-select');
            if (sel) {
                sel.innerHTML = cryptoData.slice(0, 5).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                sel.addEventListener('change', e => drawCryptoChart(e.target.value));
            }
            drawCryptoChart(cryptoData[0].id);
        } catch (e) { console.error('Crypto fetch failed:', e); }
    }

    function drawCryptoChart(coinId) {
        const coin = cryptoData?.find(c => c.id === coinId) || cryptoData?.[0];
        if (!coin?.sparkline?.length) return;

        const labels = coin.sparkline.map((_, i) => i);
        const trend = coin.sparkline[coin.sparkline.length - 1] >= coin.sparkline[0] ? '#10b981' : '#ef4444';
        if (cryptoChart) cryptoChart.destroy();

        cryptoChart = new Chart(document.getElementById('cryptoChart'), {
            type: 'line',
            data: { labels, datasets: [{ data: coin.sparkline, borderColor: trend, backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, trend + '60'); g.addColorStop(1, trend + '00'); return g; }, borderWidth: 2, fill: true, pointRadius: 0, tension: .3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,.05)' } } } }
        });
    }

    document.querySelector('[data-target="tab-crypto"]')?.addEventListener('click', () => {
        if (!cryptoContent || cryptoContent.classList.contains('hidden')) fetchCrypto();
    });

    /* ════════════════════════════════════════
       5. CURRENCY CONVERTER (direct APIs, no key needed)
       ════════════════════════════════════════ */
    let fiatRates = null;

    async function loadFiat() {
        try {
            const data = await (await fetch('https://api.exchangerate-api.com/v4/latest/USD')).json();
            fiatRates = data.rates;
            document.getElementById('fiat-loading')?.classList.add('hidden');
            document.getElementById('fiat-content')?.classList.remove('hidden');
            updateFiat();

            const ctx = document.getElementById('fiatChart');
            if (ctx) new Chart(ctx, { type: 'line', data: { labels: [1, 2, 3, 4, 5], datasets: [{ data: [102, 103.5, 103.2, 104, 104.5], borderColor: '#8b5cf6', fill: false, tension: .4, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, responsive: true, maintainAspectRatio: false } });
        } catch (e) { console.error(e); }
    }

    function updateFiat() {
        if (!fiatRates) return;
        const v = parseFloat(document.getElementById('usd-amt')?.value) || 0;
        const el = document.getElementById('fiat-results');
        if (!el) return;
        el.innerHTML = ['EUR', 'GBP', 'INR', 'JPY'].map(c => `<div class="conv-row"><span class="conv-currency">${c}</span><span class="conv-val">${(v * fiatRates[c]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>`).join('');
    }
    document.getElementById('usd-amt')?.addEventListener('input', updateFiat);

    let cryptoRates = null;
    async function loadCryptoConv() {
        try {
            cryptoRates = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,inr,eur')).json();
            document.getElementById('crypto-conv-loading')?.classList.add('hidden');
            document.getElementById('crypto-conv-content')?.classList.remove('hidden');
            updateCryptoConv();
        } catch (e) { console.error(e); }
    }

    function updateCryptoConv() {
        if (!cryptoRates) return;
        const coin = document.getElementById('crypt-sel')?.value;
        const v = parseFloat(document.getElementById('crypt-amt')?.value) || 0;
        const r = cryptoRates[coin];
        if (!r) return;
        const el = document.getElementById('crypt-results');
        if (!el) return;
        el.innerHTML = [['usd', '$'], ['eur', '€'], ['inr', '₹']].map(([k, s]) => `<div class="conv-row"><span class="conv-currency" style="text-transform:uppercase">${k}</span><span class="conv-val">${s}${(v * r[k]).toLocaleString()}</span></div>`).join('');
    }
    document.getElementById('crypt-amt')?.addEventListener('input', updateCryptoConv);
    document.getElementById('crypt-sel')?.addEventListener('change', updateCryptoConv);

    document.querySelector('[data-target="tab-converter"]')?.addEventListener('click', () => {
        if (!fiatRates) loadFiat();
        if (!cryptoRates) loadCryptoConv();
    });

});
