export default async function handler(req, res) {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true'
        );
        if (!response.ok) throw new Error(`CoinGecko: ${response.status}`);

        const raw = await response.json();

        const data = raw.map(c => ({
            id: c.id,
            name: c.name,
            symbol: c.symbol,
            image: c.image,
            price: c.current_price,
            change24h: c.price_change_percentage_24h,
            marketCap: c.market_cap,
            sparkline: c.sparkline_in_7d?.price || []
        }));

        res.status(200).json(data);
    } catch (err) {
        console.error('[/api/crypto]', err.message);
        res.status(500).json({ error: 'Crypto proxy failed' });
    }
}
