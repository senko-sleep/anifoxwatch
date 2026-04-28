import { getPool } from './db.js';
export class AnimeCache {
    static CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
    static async getAnime(id) {
        try {
            const pool = getPool();
            const result = await pool.query('SELECT * FROM anime WHERE id = $1 AND updated_at > NOW() - INTERVAL \'30 days\'', [id]);
            if (result.rows.length === 0)
                return null;
            const row = result.rows[0];
            return {
                id: row.id,
                title: row.title,
                titleJapanese: row.title_japanese,
                titleRomaji: row.title_romaji,
                titleEnglish: row.title_english,
                image: row.image,
                banner: row.banner,
                description: row.description,
                type: row.type,
                status: row.status,
                rating: row.rating,
                episodes: row.episodes,
                duration: row.duration,
                genres: row.genres,
                studios: row.studios,
                year: row.year,
                season: row.season,
                subCount: row.sub_count,
                dubCount: row.dub_count,
                streamingId: row.streaming_id,
                source: row.source,
            };
        }
        catch (error) {
            console.error('[AnimeCache] Error fetching anime:', error);
            return null;
        }
    }
    static async setAnime(anime) {
        try {
            const pool = getPool();
            await pool.query(`INSERT INTO anime (
          id, title, title_japanese, title_romaji, title_english, image, banner,
          description, type, status, rating, episodes, duration, genres,
          studios, year, season, sub_count, dub_count, streaming_id, source, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          title_japanese = EXCLUDED.title_japanese,
          title_romaji = EXCLUDED.title_romaji,
          title_english = EXCLUDED.title_english,
          image = EXCLUDED.image,
          banner = EXCLUDED.banner,
          description = EXCLUDED.description,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          rating = EXCLUDED.rating,
          episodes = EXCLUDED.episodes,
          duration = EXCLUDED.duration,
          genres = EXCLUDED.genres,
          studios = EXCLUDED.studios,
          year = EXCLUDED.year,
          season = EXCLUDED.season,
          sub_count = EXCLUDED.sub_count,
          dub_count = EXCLUDED.dub_count,
          streaming_id = EXCLUDED.streaming_id,
          source = EXCLUDED.source,
          updated_at = CURRENT_TIMESTAMP`, [
                anime.id,
                anime.title,
                anime.titleJapanese,
                anime.titleRomaji,
                anime.titleEnglish,
                anime.image,
                anime.banner,
                anime.description,
                anime.type,
                anime.status,
                anime.rating,
                anime.episodes,
                anime.duration,
                anime.genres,
                anime.studios,
                anime.year,
                anime.season,
                anime.subCount,
                anime.dubCount,
                anime.streamingId,
                anime.source,
            ]);
            console.log(`[AnimeCache] Cached anime: ${anime.id}`);
        }
        catch (error) {
            console.error('[AnimeCache] Error caching anime:', error);
        }
    }
    static async getEpisodes(animeId) {
        try {
            const pool = getPool();
            const result = await pool.query('SELECT * FROM episodes WHERE anime_id = $1 ORDER BY number ASC', [animeId]);
            return result.rows.map((row) => ({
                id: row.id,
                animeId: row.anime_id,
                number: row.number,
                title: row.title,
                isFiller: row.is_filler,
                hasSub: row.has_sub,
                hasDub: row.has_dub,
                thumbnail: row.thumbnail,
                duration: row.duration,
            }));
        }
        catch (error) {
            console.error('[AnimeCache] Error fetching episodes:', error);
            return null;
        }
    }
    static async setEpisodes(animeId, episodes) {
        try {
            const pool = getPool();
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // Delete existing episodes for this anime
                await client.query('DELETE FROM episodes WHERE anime_id = $1', [animeId]);
                // Insert new episodes
                for (const ep of episodes) {
                    await client.query(`INSERT INTO episodes (id, anime_id, number, title, is_filler, has_sub, has_dub, thumbnail, duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [ep.id, animeId, ep.number, ep.title, ep.isFiller, ep.hasSub, ep.hasDub, ep.thumbnail, ep.duration]);
                }
                await client.query('COMMIT');
                console.log(`[AnimeCache] Cached ${episodes.length} episodes for ${animeId}`);
            }
            catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error('[AnimeCache] Error caching episodes:', error);
        }
    }
    static async getSourcePreference(animeId) {
        try {
            const pool = getPool();
            const result = await pool.query('SELECT preferred_source FROM source_preferences WHERE anime_id = $1', [animeId]);
            if (result.rows.length === 0)
                return null;
            return result.rows[0].preferred_source;
        }
        catch (error) {
            console.error('[AnimeCache] Error fetching source preference:', error);
            return null;
        }
    }
    static async setSourcePreference(animeId, source) {
        try {
            const pool = getPool();
            await pool.query(`INSERT INTO source_preferences (anime_id, preferred_source, last_used)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (anime_id) DO UPDATE SET
           preferred_source = EXCLUDED.preferred_source,
           last_used = CURRENT_TIMESTAMP`, [animeId, source]);
            console.log(`[AnimeCache] Set source preference for ${animeId}: ${source}`);
        }
        catch (error) {
            console.error('[AnimeCache] Error setting source preference:', error);
        }
    }
}
//# sourceMappingURL=anime-cache.js.map