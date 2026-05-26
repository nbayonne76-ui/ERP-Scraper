"""
AI signal scorer using Claude Haiku (Anthropic).
Falls back to keyword-based scoring if no ANTHROPIC_API_KEY is set.
"""
import os
import json
import logging
import anthropic

logger = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic | None:
    global _client
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


SYSTEM_PROMPT = """You are an expert UK public and private sector ERP procurement analyst.

Your job: assess signals (tender notices, news, job postings, FOI requests) for relevance
to ERP system procurement opportunities in the UK.

For each signal, return ONLY a JSON object (no markdown) with:
- score: integer 1-10
- reason: one precise sentence (mention org name and ERP system/stage if visible)
- keywords: list of relevant terms you detected (vendor names, procurement terms)
- sector: one of Public / Private / NHS / Education / Housing / Unknown
- erp_stage: one of awareness / pre-market / selection / active-tender / implementation / unknown

Score guide:
- 10: ITT/RFP/tender published NOW for ERP system
- 9: Pre-market engagement / PIN notice — formal tender imminent (3-6 months)
- 8: Strong intent signal (job posting for ERP PM, FOI about ERP costs, budget earmarked)
- 7: Digital transformation programme announced with finance/HR scope
- 6: Leadership hire (new CIO/CFO) or M&A event — ERP review likely
- 5: General ERP discussion, vendor case study, conference mention
- 3-4: Indirect signal (IT outsourcing, vague digital transformation)
- 1-2: Unrelated or very generic

Context: UK procurement stages are: Prior Information Notice -> Market Engagement -> ITT/RFP -> Award."""


def _keyword_score(signal: dict) -> dict:
    """Fallback scorer when no ANTHROPIC_API_KEY is set."""
    text = f"{signal.get('title', '')} {signal.get('summary', '')}".lower()
    score = 2
    reason_parts = []

    tier1 = ["invitation to tender", "itt ", "request for proposal", "rfp", "rfq", "contract notice erp"]
    tier2 = ["pre-market engagement", "prior information notice", " pin ", "market engagement notice", "erp replacement", "erp selection"]
    tier3 = ["enterprise resource planning", "erp system", "erp solution", "finance system replacement", "hr system"]
    vendors = ["unit4", "sap s/4", "oracle financials", "dynamics 365", "workday", "infor", "epicor"]

    for kw in tier1:
        if kw in text:
            score = max(score, 10)
            reason_parts.append(f"'{kw}'")
    for kw in tier2:
        if kw in text:
            score = max(score, 8)
            reason_parts.append(f"'{kw}'")
    for kw in tier3:
        if kw in text:
            score = max(score, 6)
    for kw in vendors:
        if kw in text:
            score = max(score, 6)
            reason_parts.append(kw)

    url = signal.get("url", "")
    if ".gov.uk" in url or "find-tender" in url or "contractsfinder" in url:
        score = min(10, score + 1)
        reason_parts.append("official gov portal")

    if "[job posting]" in text:
        score = max(score, 7)
        reason_parts.append("active job hiring for ERP role")
    if "[foi request]" in text:
        score = max(score, 7)
        reason_parts.append("FOI on ERP costs/contracts")

    reason = "Keyword match: " + (", ".join(reason_parts) if reason_parts else "ERP content detected")
    return {
        "score": score,
        "reason": reason,
        "keywords": signal.get("keywords", []),
        "sector": signal.get("sector", "Unknown"),
        "erp_stage": "unknown",
    }


async def score_signal(signal: dict) -> dict:
    """Score a single signal. Returns updated dict with score fields."""
    client = _get_client()

    if not client:
        result = _keyword_score(signal)
        logger.debug(f"[scorer] keyword fallback -> {result['score']}/10: {signal.get('title','')[:50]}")
    else:
        try:
            prompt = f"""Title: {signal.get('title', '')}
Organisation: {signal.get('org', '')}
Source: {signal.get('source', '')}
Summary: {signal.get('summary', '')[:600]}
URL: {signal.get('url', '')}"""

            message = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw)
            logger.debug(f"[scorer] Claude Haiku {result.get('score')}/10: {signal.get('title','')[:50]}")
        except Exception as e:
            logger.warning(f"[scorer] Claude Haiku failed ({type(e).__name__}), keyword fallback")
            result = _keyword_score(signal)

    return {
        **signal,
        "score": int(result.get("score", 1)),
        "score_reason": result.get("reason", ""),
        "keywords": result.get("keywords", signal.get("keywords", [])),
        "sector": result.get("sector", signal.get("sector", "Unknown")),
        "erp_stage": result.get("erp_stage", "unknown"),
    }


async def score_signals(signals: list[dict]) -> list[dict]:
    """Score a batch of signals concurrently (10 at a time)."""
    import asyncio
    batch_size = 10
    scored = []

    for i in range(0, len(signals), batch_size):
        batch = signals[i:i + batch_size]
        results = await asyncio.gather(*[score_signal(s) for s in batch], return_exceptions=True)
        for j, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"[scorer] item {i+j} failed: {result}")
                scored.append({**batch[j], "score": 1, "score_reason": "Scoring error"})
            else:
                scored.append(result)
        if i + batch_size < len(signals):
            await asyncio.sleep(0.3)

    return scored
