"""
Buyer intelligence enrichment.
For high-score signals (>=8), uses Tavily to research the organisation's
current ERP situation, then GPT-4o-mini to extract structured intel.
Capped at MAX_ENRICHMENTS per scan to stay within Tavily free tier (1000/month).
"""
import os
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

MAX_ENRICHMENTS = 5


async def enrich_buyer(signal: dict) -> dict:
    """
    Research a buying organisation and extract ERP intelligence.
    Returns signal with 'buyer_intel' field added.
    buyer_intel = {"current_erp": "...", "notes": "..."}
    """
    org = (signal.get("org") or "").strip()
    if not org:
        return signal

    tavily_key = os.getenv("TAVILY_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not tavily_key or not openai_key:
        return signal

    import httpx
    from openai import AsyncOpenAI

    queries = [
        f"{org} ERP system current software finance HR",
        f"{org} digital transformation finance system replacement procurement",
    ]

    snippets: list[str] = []
    async with httpx.AsyncClient(timeout=20) as client:
        for q in queries:
            try:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": tavily_key,
                        "query": q,
                        "search_depth": "basic",
                        "max_results": 4,
                        "include_raw_content": False,
                    },
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        content = item.get("content", "")
                        if content:
                            snippets.append(content[:400])
            except Exception as e:
                logger.warning(f"[enricher:tavily] {org}: {type(e).__name__}: {e}")

    if not snippets:
        return signal

    context = "\n\n".join(snippets[:6])
    prompt = f"""Organisation: {org}

Web research snippets:
{context}

Extract what you can about this organisation's ERP/finance systems situation.
Return ONLY a JSON object (no markdown):
{{
  "current_erp": "name of current ERP system or 'Unknown'",
  "notes": "one sentence: key finding about their ERP situation, replacement plans, or procurement stage"
}}"""

    try:
        oai = AsyncOpenAI(api_key=openai_key)
        response = await oai.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=150,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip()
        import re as _re
        m = _re.search(r"\{.*\}", raw, _re.DOTALL)
        if m:
            intel = json.loads(m.group())
            signal = {**signal, "buyer_intel": intel}
            logger.debug(f"[enricher] {org}: {intel.get('current_erp')} — {intel.get('notes','')[:60]}")
    except Exception as e:
        logger.warning(f"[enricher:gpt] {org}: {type(e).__name__}: {e}")

    return signal


async def enrich_signals(signals: list[dict]) -> list[dict]:
    """
    Enrich high-score signals with buyer intelligence.
    Only processes signals with score >= 8, max MAX_ENRICHMENTS per scan.
    """
    candidates = [s for s in signals if s.get("score", 0) >= 8 and s.get("org")]
    to_enrich = candidates[:MAX_ENRICHMENTS]

    if not to_enrich:
        return signals

    logger.info(f"[enricher] enriching {len(to_enrich)} buyers (of {len(candidates)} eligible)")

    enriched_map: dict[int, dict] = {}
    results = await asyncio.gather(
        *[enrich_buyer(s) for s in to_enrich],
        return_exceptions=True,
    )

    for i, result in enumerate(results):
        idx = signals.index(to_enrich[i])
        if isinstance(result, Exception):
            logger.error(f"[enricher] item {i} failed: {result}")
        else:
            enriched_map[idx] = result

    return [enriched_map.get(i, s) for i, s in enumerate(signals)]
