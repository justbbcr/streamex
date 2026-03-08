// ============================================================
// StreameX Module for Sora — French (VF/VOSTFR) via Frembed
// ============================================================

const TMDB_API_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const FREMBED_BASE = "https://frembed.work";

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
                const type = item.media_type; // "movie" or "tv"
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
        const type = parts[0]; // "movie" or "tv"
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

        // TV Show — fetch show details first to get season count
        const showUrl = `${TMDB_BASE}/tv/${id}?api_key=${TMDB_API_KEY}&language=fr-FR`;
        const showResponse = await soraFetch(showUrl);
        const showData = await showResponse.json();

        let allEpisodes = [];

        const seasons = showData.seasons || [];

        for (const season of seasons) {
            const seasonNumber = season.season_number;
            if (seasonNumber === 0) continue; // Skip specials

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

// ─── Stream URL ──────────────────────────────────────────────
async function extractStreamUrl(url) {
    try {
        let streams = [];
        let subtitles = "";

        const parts = url.split("/");
        const type = parts[0]; // "movie" or "tv"
        const id = parts[1];

        // Build Frembed API URLs for each available server
        const servers = ["link1", "link3", "link7"];
        const serverNames = {
            "link1": "Dood (FR)",
            "link3": "VOE (FR)",
            "link7": "Uqload (FR)"
        };

        for (const server of servers) {
            try {
                let frembedUrl = "";

                if (type === "movie") {
                    frembedUrl = `${FREMBED_BASE}/api/stream?type=movie&tmdb=${id}&server=${server}`;
                } else {
                    const seasonNumber = parts[2];
                    const episodeNumber = parts[3];
                    frembedUrl = `${FREMBED_BASE}/api/stream?type=serie&tmdb=${id}&sa=${seasonNumber}&epi=${episodeNumber}&server=${server}`;
                }

                // Fetch the Frembed redirect to get the actual host URL
                const hostResponse = await soraFetch(frembedUrl);
                const hostHtml = await hostResponse.text();

                // Try to extract video URL from the host page
                let streamUrl = "";

                // Method 1: Direct .mp4 URL in source (works for Uqload)
                const mp4Match = hostHtml.match(/https?:\/\/[^\s'"]+\.mp4[^\s'"]*/);
                if (mp4Match) {
                    streamUrl = mp4Match[0];
                }

                // Method 2: .m3u8 URL in source
                if (!streamUrl) {
                    const m3u8Match = hostHtml.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/);
                    if (m3u8Match) {
                        streamUrl = m3u8Match[0];
                    }
                }

                // Method 3: Look for "file" or "source" JS variable
                if (!streamUrl) {
                    const fileMatch = hostHtml.match(/(?:file|source)\s*[:=]\s*["'](https?:\/\/[^"']+)/);
                    if (fileMatch) {
                        streamUrl = fileMatch[1];
                    }
                }

                if (streamUrl) {
                    streams.push({
                        title: serverNames[server] || server,
                        streamUrl,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15",
                            "Referer": "https://frembed.work/"
                        }
                    });
                }
            } catch (serverError) {
                console.log(`Error fetching server ${server}: ${serverError}`);
                // Continue to next server
            }
        }

        // If no streams found from Frembed, try direct StreameX embed (wplay fallback)
        if (streams.length === 0) {
            try {
                let embedUrl = "";
                if (type === "movie") {
                    embedUrl = `https://embed.wplay.me/embed/movie/${id}`;
                } else {
                    const seasonNumber = parts[2];
                    const episodeNumber = parts[3];
                    embedUrl = `https://embed.wplay.me/embed/tv/${id}/${seasonNumber}/${episodeNumber}`;
                }

                const embedResponse = await soraFetch(embedUrl);
                const embedHtml = await embedResponse.text();

                // Try to extract stream from wplay embed
                const mp4Match = embedHtml.match(/https?:\/\/[^\s'"]+\.mp4[^\s'"]*/);
                if (mp4Match) {
                    streams.push({
                        title: "StreameX (Fallback)",
                        streamUrl: mp4Match[0],
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }

                const m3u8Match = embedHtml.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/);
                if (m3u8Match) {
                    streams.push({
                        title: "StreameX HLS (Fallback)",
                        streamUrl: m3u8Match[0],
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            } catch (fallbackError) {
                console.log("Fallback error: " + fallbackError);
            }
        }

        const results = {
            streams,
            subtitles
        };

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log("Fetch error in extractStreamUrl: " + error);

        const result = {
            streams: [],
            subtitles: ""
        };

        console.log(JSON.stringify(result));
        return JSON.stringify(result);
    }
}

// ─── Sora Fetch Wrapper (fetchv2 with fallback) ─────────────
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
