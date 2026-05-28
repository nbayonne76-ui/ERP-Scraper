import aiosqlite
import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
DB_PATH = Path(__file__).parent / "signals.db"


def _url_hash(url: str, title: str) -> str:
    """Stable dedup key: URL preferred, else title hash."""
    raw = url.strip() if url and url.strip() else title.strip().lower()[:120]
    return hashlib.md5(raw.encode()).hexdigest()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        # Signals table with dedup hash
        await db.execute("""
            CREATE TABLE IF NOT EXISTS signals (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dedup_hash  TEXT    NOT NULL,
                source      TEXT    NOT NULL,
                title       TEXT    NOT NULL,
                org         TEXT,
                url         TEXT,
                summary     TEXT,
                sector      TEXT,
                erp_stage   TEXT    DEFAULT 'unknown',
                score       INTEGER DEFAULT 0,
                score_reason TEXT,
                keywords    TEXT,
                published   TEXT,
                detected_at TEXT    NOT NULL,
                converted   INTEGER DEFAULT 0,
                value       TEXT,
                deadline    TEXT,
                buyer_intel TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS scan_runs (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at    TEXT NOT NULL,
                finished_at   TEXT,
                sources_scanned TEXT,
                signals_found INTEGER DEFAULT 0,
                error         TEXT
            )
        """)

        # Migrations for existing DBs
        for col, definition in [
            ("dedup_hash",  "TEXT NOT NULL DEFAULT ''"),
            ("erp_stage",   "TEXT DEFAULT 'unknown'"),
            ("value",       "TEXT"),
            ("deadline",    "TEXT"),
            ("buyer_intel", "TEXT"),
        ]:
            try:
                await db.execute(f"ALTER TABLE signals ADD COLUMN {col} {definition}")
                logger.info(f"[db] migrated: added {col} column")
            except Exception:
                pass  # column already exists

        # Backfill dedup_hash for rows that have empty hash (old data or just migrated)
        cursor = await db.execute("SELECT id, url, title FROM signals WHERE dedup_hash = '' OR dedup_hash IS NULL")
        rows = await cursor.fetchall()
        if rows:
            for row in rows:
                h = _url_hash(row[1] or "", row[2] or "")
                # If hash already exists for another row, make it unique with id
                try:
                    await db.execute("UPDATE signals SET dedup_hash = ? WHERE id = ?", (h, row[0]))
                except Exception:
                    await db.execute("UPDATE signals SET dedup_hash = ? WHERE id = ?", (f"{h}_{row[0]}", row[0]))
            await db.commit()
            logger.info(f"[db] backfilled {len(rows)} dedup hashes")

        # Indexes — created after backfill so no duplicates
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedup
            ON signals (dedup_hash)
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_score ON signals (score DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_detected ON signals (detected_at DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_converted ON signals (converted)")

        await db.commit()
    logger.info(f"[db] ready at {DB_PATH}")


async def insert_signal(signal: dict) -> int | None:
    """Insert signal. Returns new id or None if duplicate."""
    dedup = _url_hash(signal.get("url", ""), signal.get("title", ""))
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            buyer_intel = signal.get("buyer_intel")
            cursor = await db.execute("""
                INSERT INTO signals
                (dedup_hash, source, title, org, url, summary, sector, erp_stage, score,
                 score_reason, keywords, published, detected_at, converted,
                 value, deadline, buyer_intel)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            """, (
                dedup,
                signal.get("source"),
                signal.get("title"),
                signal.get("org"),
                signal.get("url"),
                signal.get("summary"),
                signal.get("sector"),
                signal.get("erp_stage", "unknown"),
                signal.get("score", 0),
                signal.get("score_reason"),
                json.dumps(signal.get("keywords", [])),
                signal.get("published"),
                signal.get("detected_at"),
                signal.get("value"),
                signal.get("deadline"),
                json.dumps(buyer_intel) if buyer_intel else None,
            ))
            await db.commit()
            return cursor.lastrowid
        except aiosqlite.IntegrityError:
            # Duplicate — update score and erp_stage if new score is higher
            await db.execute("""
                UPDATE signals SET score = MAX(score, ?), score_reason = ?, erp_stage = ?
                WHERE dedup_hash = ? AND score < ?
            """, (signal.get("score", 0), signal.get("score_reason"), signal.get("erp_stage", "unknown"), dedup, signal.get("score", 0)))
            await db.commit()
            return None


async def get_signals(
    limit: int = 100,
    min_score: int = 0,
    converted: int | None = None,
    sector: str | None = None,
) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM signals WHERE score >= ?"
        params: list = [min_score]
        if converted is not None:
            query += " AND converted = ?"
            params.append(converted)
        if sector:
            query += " AND sector = ?"
            params.append(sector)
        query += " ORDER BY score DESC, detected_at DESC LIMIT ?"
        params.append(limit)
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["keywords"] = json.loads(d.get("keywords") or "[]")
            raw_intel = d.get("buyer_intel")
            d["buyer_intel"] = json.loads(raw_intel) if raw_intel else None
            result.append(d)
        return result


async def get_signal_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM signals")
        row = await cursor.fetchone()
        return row[0] if row else 0


async def mark_converted(signal_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE signals SET converted = 1 WHERE id = ?", (signal_id,))
        await db.commit()


async def insert_scan_run(started_at: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO scan_runs (started_at, sources_scanned) VALUES (?, ?)",
            (started_at, "[]")
        )
        await db.commit()
        return cursor.lastrowid


async def finish_scan_run(run_id: int, finished_at: str, sources: list, count: int, error: str | None = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE scan_runs SET finished_at=?, sources_scanned=?, signals_found=?, error=?
            WHERE id=?
        """, (finished_at, json.dumps(sources), count, error, run_id))
        await db.commit()


async def get_last_scan() -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1")
        row = await cursor.fetchone()
        if row:
            d = dict(row)
            d["sources_scanned"] = json.loads(d.get("sources_scanned") or "[]")
            return d
        return None
