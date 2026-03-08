// ============================================================
// StreameX Module for Sora — French (VF/VOSTFR)
// Uses TMDB API for metadata + multiple embed providers
// ============================================================

const TMDB_API_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

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

// ─── Stream URL ──────────────────────────────────────────────
async function extractStreamUrl(url) {
    try {
        let streams = [];
        let subtitlesList = [];

        const parts = url.split("/");
        const type = parts[0]; // "movie" or "tv"
        const id = parts[1];
        const season = parts[2];
        const episode = parts[3];

        // ── Provider 1: Videasy (good quality, often works) ──
        try {
            let videasyUrl = "";
            if (type === "movie") {
                videasyUrl = `https://player.videasy.net/movie/${id}`;
            } else {
                videasyUrl = `https://player.videasy.net/tv/${id}/${season}/${episode}`;
            }

            const videasyResponse = await soraFetch(videasyUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            const videasyHtml = await videasyResponse.text();

            // Look for m3u8 URLs
            const m3u8Matches = videasyHtml.match(/https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*/g);
            if (m3u8Matches) {
                for (const m3u8 of m3u8Matches) {
                    streams.push({
                        title: "Videasy",
                        streamUrl: m3u8,
                        headers: {
                            "Referer": "https://player.videasy.net/",
                            "Origin": "https://player.videasy.net",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            }

            // Look for mp4 URLs
            const mp4Matches = videasyHtml.match(/https?:\/\/[^\s'"\\]+\.mp4[^\s'"\\]*/g);
            if (mp4Matches) {
                for (const mp4 of mp4Matches) {
                    streams.push({
                        title: "Videasy MP4",
                        streamUrl: mp4,
                        headers: {
                            "Referer": "https://player.videasy.net/",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            }
        } catch (e) {
            console.log("Videasy error: " + e);
        }

        // ── Provider 2: VidSrc.cc ──
        try {
            let vidsrcUrl = "";
            if (type === "movie") {
                vidsrcUrl = `https://vidsrc.cc/v2/embed/movie/${id}`;
            } else {
                vidsrcUrl = `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;
            }

            const vidsrcResponse = await soraFetch(vidsrcUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            const vidsrcHtml = await vidsrcResponse.text();

            // Extract iframe src to follow the chain
            const iframeMatch = vidsrcHtml.match(/src=["'](https?:\/\/[^"']+)["']/g);
            if (iframeMatch) {
                for (const iframeSrc of iframeMatch) {
                    const srcUrl = iframeSrc.match(/src=["'](https?:\/\/[^"']+)["']/);
                    if (srcUrl && srcUrl[1]) {
                        try {
                            const iframeResponse = await soraFetch(srcUrl[1], {
                                headers: {
                                    "Referer": "https://vidsrc.cc/",
                                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                                }
                            });
                            const iframeHtml = await iframeResponse.text();

                            const streamMatches = iframeHtml.match(/https?:\/\/[^\s'"\\]+\.(m3u8|mp4)[^\s'"\\]*/g);
                            if (streamMatches) {
                                for (const streamUrl of streamMatches) {
                                    streams.push({
                                        title: "VidSrc",
                                        streamUrl: streamUrl,
                                        headers: {
                                            "Referer": srcUrl[1],
                                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                                        }
                                    });
                                }
                            }
                        } catch (iframeError) {
                            console.log("iframe fetch error: " + iframeError);
                        }
                    }
                }
            }
        } catch (e) {
            console.log("VidSrc error: " + e);
        }

        // ── Provider 3: autoembed.cc ──
        try {
            let autoembedUrl = "";
            if (type === "movie") {
                autoembedUrl = `https://player.autoembed.cc/embed/movie/${id}`;
            } else {
                autoembedUrl = `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`;
            }

            const autoResponse = await soraFetch(autoembedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            const autoHtml = await autoResponse.text();

            const streamMatches = autoHtml.match(/https?:\/\/[^\s'"\\]+\.(m3u8|mp4)[^\s'"\\]*/g);
            if (streamMatches) {
                for (const streamUrl of streamMatches) {
                    streams.push({
                        title: "AutoEmbed",
                        streamUrl: streamUrl,
                        headers: {
                            "Referer": "https://player.autoembed.cc/",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            }
        } catch (e) {
            console.log("AutoEmbed error: " + e);
        }

        // ── Provider 4: multiembed ──
        try {
            let multiUrl = "";
            if (type === "movie") {
                multiUrl = `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`;
            } else {
                multiUrl = `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
            }

            const multiResponse = await soraFetch(multiUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            const multiHtml = await multiResponse.text();

            const streamMatches = multiHtml.match(/https?:\/\/[^\s'"\\]+\.(m3u8|mp4)[^\s'"\\]*/g);
            if (streamMatches) {
                for (const streamUrl of streamMatches) {
                    streams.push({
                        title: "MultiEmbed",
                        streamUrl: streamUrl,
                        headers: {
                            "Referer": "https://multiembed.mov/",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            }
        } catch (e) {
            console.log("MultiEmbed error: " + e);
        }

        // ── Provider 5: Frembed (French VF/VOSTFR) ──
        try {
            let frembedUrl = "";
            if (type === "movie") {
                frembedUrl = `https://frembed.buzz/api/film.php?id=${id}`;
            } else {
                frembedUrl = `https://frembed.buzz/api/serie.php?id=${id}&sa=${season}&epi=${episode}`;
            }

            const frembedResponse = await soraFetch(frembedUrl, {
                headers: {
                    "Referer": "https://www.streamex.net/",
                    "Origin": "https://www.streamex.net",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                }
            });
            const frembedHtml = await frembedResponse.text();

            // Try to find stream URLs in the page
            const streamMatches = frembedHtml.match(/https?:\/\/[^\s'"\\]+\.(m3u8|mp4)[^\s'"\\]*/g);
            if (streamMatches) {
                for (const streamUrl of streamMatches) {
                    streams.push({
                        title: "Frembed FR",
                        streamUrl: streamUrl,
                        headers: {
                            "Referer": "https://frembed.work/",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                }
            }

            // Also try to find iframe sources and follow them
            const iframeMatch = frembedHtml.match(/src=["'](https?:\/\/[^"']+)["']/);
            if (iframeMatch && iframeMatch[1]) {
                try {
                    const iframeResponse = await soraFetch(iframeMatch[1], {
                        headers: {
                            "Referer": "https://frembed.work/",
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                        }
                    });
                    const iframeHtml = await iframeResponse.text();

                    const iframeStreamMatches = iframeHtml.match(/https?:\/\/[^\s'"\\]+\.(m3u8|mp4)[^\s'"\\]*/g);
                    if (iframeStreamMatches) {
                        for (const streamUrl of iframeStreamMatches) {
                            streams.push({
                                title: "Frembed FR",
                                streamUrl: streamUrl,
                                headers: {
                                    "Referer": iframeMatch[1],
                                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                                }
                            });
                        }
                    }
                } catch (iframeError) {
                    console.log("Frembed iframe error: " + iframeError);
                }
            }
        } catch (e) {
            console.log("Frembed error: " + e);
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
