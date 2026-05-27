"""
Background scheduler — runs scans every N hours via APScheduler.
"""
import asyncio
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from scrapers import run_all_scrapers
from scorer import score_signals
from db import insert_signal, insert_scan_run, finish_scan_run

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()
_last_scan_status: dict = {"running": False, "last_run": None, "signals_found": 0, "error": None}


async def run_scan():
    global _last_scan_status

    if _last_scan_status["running"]:
        logger.info("[scheduler] scan already running, skipping")
        return

    _last_scan_status["running"] = True
    started_at = datetime.now(timezone.utc).isoformat()
    run_id = await insert_scan_run(started_at)

    try:
        logger.info(f"[scheduler] Starting scan at {started_at}")
        signals, sources = await run_all_scrapers()
        logger.info(f"[scheduler] Scraped {len(signals)} raw signals from {len(sources)} sources")

        scored = await score_signals(signals)
        logger.info(f"[scheduler] Scored {len(scored)} signals")

        saved = 0
        for s in scored:
            if s.get("score", 0) >= 4:  # Only save relevant signals
                await insert_signal(s)
                saved += 1

        finished_at = datetime.now(timezone.utc).isoformat()
        await finish_scan_run(run_id, finished_at, sources, saved)

        _last_scan_status.update({
            "running": False,
            "last_run": finished_at,
            "signals_found": saved,
            "error": None,
        })
        logger.info(f"[scheduler] Done. Saved {saved} signals (score >= 4)")

    except Exception as e:
        error_msg = str(e)
        finished_at = datetime.now(timezone.utc).isoformat()
        await finish_scan_run(run_id, finished_at, [], 0, error_msg)
        _last_scan_status.update({
            "running": False,
            "last_run": finished_at,
            "signals_found": 0,
            "error": error_msg,
        })
        logger.error(f"[scheduler] Scan failed: {e}")


def get_scan_status() -> dict:
    return _last_scan_status.copy()


def start_scheduler(interval_hours: int = 6):
    scheduler.add_job(
        lambda: asyncio.create_task(run_scan()),
        trigger=IntervalTrigger(hours=interval_hours),
        id="erp_scan",
        name="ERP Signal Scan",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"[scheduler] Started — scanning every {interval_hours}h")
