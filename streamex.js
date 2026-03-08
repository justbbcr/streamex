// ============================================================
// StreameX Module for Sora — French (VF/VOSTFR)
// Uses TMDB API (fr-FR) + vidsrc.cc API for stream extraction
// Approach based on ibro's vidsrcCC & rive modules
// ============================================================

const TMDB_API_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const PROXY = "https://clannad-peak.vercel.app/api/proxy?url=";

// ─── Search (TMDB fr-FR) ────────────────────────────────────
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const tmdbUrl = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodedKeyword}&language=fr-FR&page=1&include_adult=false`;
        const responseText = await soraFetch(`${PROXY}${encodeURIComponent(tmdbUrl)}`);
        const data = await responseText.json();

        const transformedResults = data.results
            .filter(item => item.media_type === "movie" || item.media_type === "tv")
            .map(item => {
                if (item.media_type === "movie" || item.title) {
                    return {
                        title: item.title || item.name || "Sans titre",
                        image: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "",
                        href: `movie/${item.id}`
                    };
                } else {
                    return {
                        title: item.name || item.title || "Sans titre",
                        image: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "",
                        href: `tv/${item.id}/1/1`
                    };
                }
            });

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

// ─── Details (TMDB fr-FR) ───────────────────────────────────
async function extractDetails(url) {
    try {
        if (url.includes("movie")) {
            const match = url.match(/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const tmdbUrl = `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
            const responseText = await soraFetch(`${PROXY}${encodeURIComponent(tmdbUrl)}`);
            const data = await responseText.json();

            return JSON.stringify([{
                description: data.overview || "Aucune description disponible",
                aliases: `Durée: ${data.runtime ? data.runtime + " minutes" : "N/A"}`,
                airdate: `Sortie: ${data.release_date || "N/A"}`
            }]);
        } else if (url.includes("tv")) {
            const match = url.match(/tv\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const tmdbUrl = `${TMDB_BASE}/tv/${showId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
            const responseText = await soraFetch(`${PROXY}${encodeURIComponent(tmdbUrl)}`);
            const data = await responseText.json();

            return JSON.stringify([{
                description: data.overview || "Aucune description disponible",
                aliases: `Saisons: ${data.number_of_seasons || "N/A"}`,
                airdate: `Première diffusion: ${data.first_air_date || "N/A"}`
            }]);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log("Details error: " + error);
        return JSON.stringify([{
            description: "Erreur de chargement",
            aliases: "Durée: Inconnue",
            airdate: "Sortie: Inconnue"
        }]);
    }
}

// ─── Episodes (TMDB fr-FR) ──────────────────────────────────
async function extractEpisodes(url) {
    try {
        if (url.includes("movie")) {
            const match = url.match(/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];

            return JSON.stringify([
                { href: `https://vidsrc.cc/v2/embed/movie/${movieId}`, number: 1, title: "Film complet" }
            ]);
        } else if (url.includes("tv")) {
            const match = url.match(/tv\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];

            const tmdbUrl = `${TMDB_BASE}/tv/${showId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
            const showResponseText = await soraFetch(`${PROXY}${encodeURIComponent(tmdbUrl)}`);
            const showData = await showResponseText.json();

            let allEpisodes = [];
            for (const season of showData.seasons) {
                const seasonNumber = season.season_number;
                if (seasonNumber === 0) continue;

                const seasonUrl = `${TMDB_BASE}/tv/${showId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=fr-FR`;
                const seasonResponseText = await soraFetch(`${PROXY}${encodeURIComponent(seasonUrl)}`);
                const seasonData = await seasonResponseText.json();

                if (seasonData.episodes && seasonData.episodes.length) {
                    const episodes = seasonData.episodes.map(episode => ({
                        href: `https://vidsrc.cc/v2/embed/tv/${showId}/${seasonNumber}/${episode.episode_number}`,
                        number: episode.episode_number,
                        title: episode.name || `Épisode ${episode.episode_number}`
                    }));
                    allEpisodes = allEpisodes.concat(episodes);
                }
            }

            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log("Fetch error in extractEpisodes: " + error);
        return JSON.stringify([]);
    }
}

// ─── Stream URL (vidsrc.cc via networkFetch) ─────────────────
async function extractStreamUrl(url) {
    try {
        // Use networkFetch to load the embed page and intercept API calls
        const serverList = await networkFetch(url, 7, {}, "servers");

        console.log("VidSrc serverList: " + JSON.stringify(serverList));

        if (serverList.requests && serverList.requests.length > 0) {
            const apiUrl = serverList.requests.find(u => u.includes("servers")) || "";

            console.log("API URL: " + apiUrl);

            if (apiUrl === "") {
                console.log("API URL not found");
                return JSON.stringify({ streams: [], subtitles: "" });
            }

            const response = await soraFetch(apiUrl);
            const data = await response.json();

            console.log("Server Data: " + JSON.stringify(data));

            const servers = data.data.map(server => ({
                name: server.name,
                hash: server.hash
            }));

            console.log("Servers: " + JSON.stringify(servers));

            let streams = [];
            let subtitles = "";

            for (const server of servers) {
                // Skip problematic servers
                if (server.name === "UpCloud") continue;

                try {
                    const responseText = await soraFetch(`https://vidsrc.cc/api/source/${server.hash}`);
                    const source = await responseText.json();

                    console.log("Source for " + server.name + ": " + JSON.stringify(source));

                    const streamUrl = source.data?.source;
                    
                    // Try to get French subtitles first, fallback to English
                    const frSubs = source.data?.subtitles?.find(track =>
                        (track.label.includes("French") || track.label.includes("Français")) && track.kind === "captions"
                    )?.file;
                    const enSubs = source.data?.subtitles?.find(track =>
                        track.label.includes("English") && track.kind === "captions"
                    )?.file;

                    if (streamUrl) {
                        streams.push({
                            title: server.name,
                            streamUrl,
                            headers: {
                                "Referer": "https://vidsrc.cc/",
                                "Origin": "https://vidsrc.cc"
                            }
                        });
                    }

                    // Set subtitles (prefer French)
                    if (subtitles === "") {
                        subtitles = frSubs || enSubs || "";
                    }
                } catch (sourceError) {
                    console.log("Error fetching source for " + server.name + ": " + sourceError);
                }
            }

            const results = {
                streams,
                subtitles
            };

            console.log("Results: " + JSON.stringify(results));
            return JSON.stringify(results);
        } else {
            console.log("No requests intercepted, returning empty");
            return JSON.stringify({ streams: [], subtitles: "" });
        }
    } catch (error) {
        console.log("Fetch error in extractStreamUrl: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

// ─── Sora Fetch Wrapper ─────────────────────────────────────
async function soraFetch(url, options = { headers: {}, method: "GET", body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? "GET", options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
