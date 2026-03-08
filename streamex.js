// ============================================================
// StreameX Module for Sora — French (VF/VOSTFR)
// Uses TMDB API for metadata + vidsrc.xyz embed provider
// ============================================================

const TMDB_API_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// Blacklist domains known to serve ads or decoy videos
const AD_DOMAINS = [
    "raw.githubusercontent.com",
    "test-videos.co.uk",
    "github.com",
    "googleadservices",
    "doubleclick.net",
    "googlesyndication",
    "adservice",
    "bunny.net/test",
    "sample-videos"
];

function isAdUrl(url) {
    const lower = url.toLowerCase();
    return AD_DOMAINS.some(domain => lower.includes(domain));
}

// ─── Search ──────────────────────────────────────────────────
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodedKeyword}&language=fr-FR&page=1&include_adult=false`;
        const response = await soraFetch(url);
        const data = await response.json();

        const transformedResults = data.results
            .filter(item => item.media_type === "movie" || item.media_type === "tv")
            .map(item => {
                const title = item.title || item.name || "Sans titre";
                const image = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "";
                const type = item.media_type;
                return {
                    title,
                    image,
                    href: `${type}/${item.id}`
                };
            });

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

// ─── Details ─────────────────────────────────────────────────
async function extractDetails(url) {
    try {
        const parts = url.split("/");
        const type = parts[0];
        const id = parts[1];

        const apiUrl = `${TMDB_BASE}/${type}/${id}?api_key=${TMDB_API_KEY}&language=fr-FR`;
        const response = await soraFetch(apiUrl);
        const data = await response.json();

        let aliases = "Durée: N/A";
        if (type === "movie" && data.runtime) {
            aliases = `Durée: ${data.runtime} minutes`;
        } else if (type === "tv" && data.number_of_seasons) {
            aliases = `Saisons: ${data.number_of_seasons}`;
        }

        const airdate = type === "movie"
            ? `Sortie: ${data.release_date || "N/A"}`
            : `Première diffusion: ${data.first_air_date || "N/A"}`;

        const transformedResults = [{
            description: data.overview || "Aucune description disponible",
            aliases,
            airdate
        }];

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Details error: " + error);
        return JSON.stringify([{
            description: "Erreur de chargement",
            aliases: "Durée: Inconnue",
            airdate: "Sortie: Inconnue"
        }]);
    }
}

// ─── Episodes ────────────────────────────────────────────────
async function extractEpisodes(url) {
    try {
        const parts = url.split("/");
        const type = parts[0];
        const id = parts[1];

        if (type === "movie") {
            return JSON.stringify([
                { href: `movie/${id}`, number: 1, title: "Film complet" }
            ]);
        }

        const showUrl = `${TMDB_BASE}/tv/${id}?api_key=${TMDB_API_KEY}&language=fr-FR`;
        const showResponse = await soraFetch(showUrl);
        const showData = await showResponse.json();

        let allEpisodes = [];
        const seasons = showData.seasons || [];

        for (const season of seasons) {
            const seasonNumber = season.season_number;
            if (seasonNumber === 0) continue;

            const seasonUrl = `${TMDB_BASE}/tv/${id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=fr-FR`;
            const seasonResponse = await soraFetch(seasonUrl);
            const seasonData = await seasonResponse.json();

            if (seasonData.episodes) {
                for (const episode of seasonData.episodes) {
                    allEpisodes.push({
                        href: `tv/${id}/${seasonNumber}/${episode.episode_number}`,
                        number: episode.episode_number,
                        title: episode.name || `Épisode ${episode.episode_number}`
                    });
                }
            }
        }

        return JSON.stringify(allEpisodes);
    } catch (error) {
        console.log("Fetch error in extractEpisodes: " + error);
        return JSON.stringify([]);
    }
}

// ─── Helper: Extract valid stream URLs from HTML ─────────────
function extractStreamsFromHtml(html, title, referer) {
    let found = [];
    
    // Match m3u8 URLs
    const m3u8Matches = html.match(/https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*/g);
    if (m3u8Matches) {
        for (const url of m3u8Matches) {
            if (!isAdUrl(url)) {
                found.push({
                    title: title,
                    streamUrl: url,
                    headers: {
                        "Referer": referer,
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        }
    }

    // Match mp4 URLs
    const mp4Matches = html.match(/https?:\/\/[^\s'"\\]+\.mp4[^\s'"\\]*/g);
    if (mp4Matches) {
        for (const url of mp4Matches) {
            if (!isAdUrl(url)) {
                found.push({
                    title: title + " MP4",
                    streamUrl: url,
                    headers: {
                        "Referer": referer,
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        }
    }

    return found;
}

// ─── Helper: Follow iframes and extract streams ──────────────
async function followIframesAndExtract(html, title, referer, depth) {
    let streams = [];
    if (depth <= 0) return streams;

    // First try to find direct streams
    streams = streams.concat(extractStreamsFromHtml(html, title, referer));

    // Then find and follow iframes
    const iframeSrcMatches = html.match(/src=["'](https?:\/\/[^"']+)["']/g);
    if (iframeSrcMatches) {
        for (const match of iframeSrcMatches) {
            const srcMatch = match.match(/src=["'](https?:\/\/[^"']+)["']/);
            if (srcMatch && srcMatch[1]) {
                const iframeSrc = srcMatch[1];
                
                // Skip ad/tracking iframes
                if (isAdUrl(iframeSrc)) continue;
                // Skip CSS/JS/image resources
                if (iframeSrc.match(/\.(css|js|png|jpg|gif|svg|ico|woff)$/i)) continue;

                try {
                    const iframeResponse = await soraFetch(iframeSrc, {
                        headers: {
                            "Referer": referer,
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                    if (iframeResponse) {
                        const iframeHtml = await iframeResponse.text();
                        const iframeStreams = await followIframesAndExtract(iframeHtml, title, iframeSrc, depth - 1);
                        streams = streams.concat(iframeStreams);
                    }
                } catch (e) {
                    console.log("Iframe follow error: " + e);
                }
            }
        }
    }

    return streams;
}

// ─── Stream URL ──────────────────────────────────────────────
async function extractStreamUrl(url) {
    try {
        let streams = [];

        const parts = url.split("/");
        const type = parts[0]; // "movie" or "tv"
        const id = parts[1];
        const season = parts[2];
        const episode = parts[3];

        // ── Provider 1: vidsrc.xyz (follows iframes deep) ──
        try {
            let embedUrl = "";
            if (type === "movie") {
                embedUrl = `https://vidsrc.xyz/embed/movie/${id}`;
            } else {
                embedUrl = `https://vidsrc.xyz/embed/tv/${id}/${season}/${episode}`;
            }

            const response = await soraFetch(embedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            if (response) {
                const html = await response.text();
                const found = await followIframesAndExtract(html, "VidSrc", embedUrl, 3);
                streams = streams.concat(found);
            }
        } catch (e) {
            console.log("vidsrc.xyz error: " + e);
        }

        // ── Provider 2: multiembed.mov ──
        try {
            let embedUrl = "";
            if (type === "movie") {
                embedUrl = `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`;
            } else {
                embedUrl = `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
            }

            const response = await soraFetch(embedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            if (response) {
                const html = await response.text();
                const found = await followIframesAndExtract(html, "MultiEmbed", embedUrl, 3);
                streams = streams.concat(found);
            }
        } catch (e) {
            console.log("multiembed error: " + e);
        }

        // ── Provider 3: autoembed.cc ──
        try {
            let embedUrl = "";
            if (type === "movie") {
                embedUrl = `https://player.autoembed.cc/embed/movie/${id}`;
            } else {
                embedUrl = `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`;
            }

            const response = await soraFetch(embedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            if (response) {
                const html = await response.text();
                const found = await followIframesAndExtract(html, "AutoEmbed", embedUrl, 3);
                streams = streams.concat(found);
            }
        } catch (e) {
            console.log("autoembed error: " + e);
        }

        // ── Provider 4: Frembed FR ──
        try {
            let embedUrl = "";
            if (type === "movie") {
                embedUrl = `https://frembed.buzz/api/film.php?id=${id}`;
            } else {
                embedUrl = `https://frembed.buzz/api/serie.php?id=${id}&sa=${season}&epi=${episode}`;
            }

            const response = await soraFetch(embedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "Origin": "https://www.streamex.net",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            if (response) {
                const html = await response.text();
                const found = await followIframesAndExtract(html, "Frembed FR", embedUrl, 3);
                streams = streams.concat(found);
            }
        } catch (e) {
            console.log("frembed error: " + e);
        }

        const results = {
            streams,
            subtitles: ""
        };

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log("Fetch error in extractStreamUrl: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

// ─── Sora Fetch Wrapper ─────────────────────────────────────
async function soraFetch(url, options = { headers: {}, method: "GET", body: null, encoding: "utf-8" }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? "GET",
            options.body ?? null,
            true,
            options.encoding ?? "utf-8"
        );
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
