import pg from 'pg';
const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('POSTGRES_URL environment variable is not set');
    }
    
    pool = new Pool({
      connectionString,
      max: 5, // Reduced from 10 to prevent flooding
      idleTimeoutMillis: 10000, // Reduced from 30000 to release idle connections faster
      connectionTimeoutMillis: 5000, // Increased from 2000 to give more time for connection
      statement_timeout: 10000, // Add statement timeout to prevent long-running queries
    });
  }
  
  return pool;
}

export async function initDatabase(): Promise<void> {
  // Only initialize if POSTGRES_URL is set
  if (!process.env.POSTGRES_URL) {
    console.log('[DB] POSTGRES_URL not set - skipping database initialization');
    return;
  }

  const pool = getPool();
  
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS anime (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_japanese TEXT,
      title_romaji TEXT,
      title_english TEXT,
      image TEXT,
      banner TEXT,
      description TEXT,
      type TEXT,
      status TEXT,
      rating TEXT,
      episodes INTEGER,
      duration TEXT,
      genres TEXT[],
      studios TEXT[],
      year INTEGER,
      season TEXT,
      sub_count INTEGER DEFAULT 0,
      dub_count INTEGER DEFAULT 0,
      streaming_id TEXT,
      source TEXT DEFAULT 'cached',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT,
      is_filler BOOLEAN DEFAULT FALSE,
      has_sub BOOLEAN DEFAULT TRUE,
      has_dub BOOLEAN DEFAULT FALSE,
      thumbnail TEXT,
      duration INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(anime_id, number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id SERIAL PRIMARY KEY,
      anime_id TEXT NOT NULL,
      anime_title TEXT NOT NULL,
      anime_image TEXT,
      episode_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      timestamp DECIMAL NOT NULL,
      duration INTEGER NOT NULL,
      progress DECIMAL NOT NULL,
      last_watched TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      frame_thumbnail TEXT,
      UNIQUE(anime_id, episode_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS source_preferences (
      anime_id TEXT PRIMARY KEY,
      preferred_source TEXT NOT NULL,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes for faster queries
  await pool.query('CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_anime_streaming_id ON anime(streaming_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_episodes_anime_id ON episodes(anime_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(last_watched DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_watch_history_anime_id ON watch_history(anime_id);');
  
  console.log('[DB] Database initialized successfully');
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
