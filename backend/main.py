"""
UK ERP Tender Tracker — Intelligence Backend
FastAPI + APScheduler — auto-scans for ERP signals every N hours
"""
import os
import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            "datefmt": "%H:%M:%S",
        }
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "default"},
    },
    "root": {"level": "INFO", "handlers": ["console"]},
    "loggers": {
        "uvicorn": {"level": "WARNING"},
        "watchfiles": {"level": "WARNING"},
        "apscheduler": {"level": "WARNING"},
    },
})

logger = logging.getLogger(__name__)

from db import init_db, get_signals, get_last_scan, mark_converted, get_signal_count
from scheduler import start_scheduler, run_scan, get_scan_status

SCAN_INTERVAL_HOURS = int(os.getenv("SCAN_INTERVAL_HOURS", "6"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler(SCAN_INTERVAL_HOURS)
    # First scan immediately on startup
    asyncio.create_task(run_scan())
    logger.info(f"UK ERP Intelligence backend started — scanning every {SCAN_INTERVAL_HOURS}h")
    yield
    from scheduler import scheduler
    scheduler.shutdown(wait=False)
    logger.info("Backend shutdown complete")


app = FastAPI(title="UK ERP Tender Intelligence API", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    total = await get_signal_count()
    return {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "total_signals": total,
    }


@app.get("/api/signals")
async def list_signals(
    min_score: int = Query(default=4, ge=1, le=10),
    limit: int = Query(default=200, le=500),
    converted: int | None = Query(default=None),
    sector: str | None = Query(default=None),
):
    signals = await get_signals(limit=limit, min_score=min_score, converted=converted, sector=sector)
    return {"signals": signals, "count": len(signals)}


@app.get("/api/status")
async def scan_status():
    scan = get_scan_status()
    last = await get_last_scan()
    total = await get_signal_count()
    return {
        "scan": scan,
        "last_run": last,
        "interval_hours": SCAN_INTERVAL_HOURS,
        "total_signals_db": total,
    }


@app.post("/api/scan")
async def trigger_scan():
    """Manually trigger a full scan."""
    status = get_scan_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="Scan already running")
    asyncio.create_task(run_scan())
    return {"message": "Scan started"}


@app.post("/api/signals/{signal_id}/convert")
async def convert_signal(signal_id: int):
    """Mark signal as converted to tender in the tracker."""
    await mark_converted(signal_id)
    return {"message": "Marked as converted"}




@app.post("/api/email/draft")
async def draft_email(body: dict):
    """Generate a personalised outreach email for a signal + contact."""
    from openai import AsyncOpenAI

    signal_id = body.get("signal_id")
    contact_idx = int(body.get("contact_idx", 0))

    signals = await get_signals(limit=2000)
    signal = next((s for s in signals if s["id"] == signal_id), None)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        raise HTTPException(status_code=503, detail="No OPENAI_API_KEY configured")

    contacts = signal.get("contacts") or []
    contact = contacts[contact_idx] if contact_idx < len(contacts) else None
    buyer_intel = signal.get("buyer_intel") or {}

    contact_name = contact.get("name", "[Name]") if contact else "[Name]"
    contact_title = contact.get("title", "") if contact else ""
    org = signal.get("org", "")
    current_erp = buyer_intel.get("current_erp", "Unknown")
    expiry = buyer_intel.get("contract_expiry", "")
    notes = buyer_intel.get("notes", "") or signal.get("score_reason", "")

    prompt = f"""Write a concise professional cold outreach email for an ERP sales representative.

Context:
- Organisation: {org}
- Contact: {contact_name}{f" ({contact_title})" if contact_title else ""}
- Their current ERP: {current_erp}
- Contract situation: {expiry if expiry and expiry != "Unknown" else "not confirmed"} 
- Intelligence: {notes}

Requirements:
- Start with: Subject: [subject line]
- Then a blank line, then the email body
- Maximum 150 words total
- Reference their specific ERP situation naturally
- Consultative tone — offer value, not product push
- End with a low-pressure CTA (15-min call or reply)
- Sign off as: [Your Name] | [Your Company]
- Do NOT mention how you obtained this information"""

    try:
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=400,
            temperature=0.7,
            messages=[{"role": "user", "content": prompt}],
        )
        email_text = response.choices[0].message.content.strip()
        return {"email": email_text, "contact": contact, "org": org}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
