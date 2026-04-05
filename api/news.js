export default async function handler(req, res) {
    const category = req.query?.category || 'general';

    let url = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12';
    if (category === 'technology') url = 'https://hn.algolia.com/api/v1/search?query=tech&tags=story&hitsPerPage=12';
    if (category === 'business')   url = 'https://hn.algolia.com/api/v1/search?query=finance&tags=story&hitsPerPage=12';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`News: ${response.status}`);

        const raw = await response.json();
        const clickbait = /shocking|breaking|secret|exposed|you won't believe|scandal|leaked|insane/i;

        const data = raw.hits.filter(h => h.title).map(h => {
            let score = 92;
            if (h.title.length > 85) score -= 10;
            if (clickbait.test(h.title)) score -= 35;

            const host = h.url ? (() => { try { return new URL(h.url).hostname; } catch { return ''; } })() : '';
            if (/reuters|bloomberg|wsj|nytimes|bbc/.test(host)) score += 5;
            score = Math.max(10, Math.min(99, score));

            return {
                title: h.title,
                source: host || 'HackerNews',
                url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
                publishedAt: h.created_at,
                credibilityScore: score
            };
        });

        res.status(200).json(data);
    } catch (err) {
        console.error('[/api/news]', err.message);
        res.status(500).json({ error: 'News proxy failed' });
    }
}
