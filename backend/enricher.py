"""
Buyer intelligence enrichment.
For high-score signals (>=8), researches the buying organisation's ERP situation.

Priority chain:
  1. Perplexity sonar-online  — one call, synthesized answer + live web citations
  2. Tavily + GPT-4o-mini     — fallback if no PERPLEXITY_API_KEY
  3. Skip                     — if neither key available

Capped at MAX_ENRICHMENTS per scan to preserve free-tier quotas.
"""
import os
import json
import re
import logging
import asyncio

logger = logging.getLogger(__name__)

MAX_ENRICHMENTS = 5

_INTEL_PROMPT = """You are researching a UK public sector organisation's ERP/finance system situation.
Organisation: {org}

Find their current ERP or financial management system, the contract expiry date if available,
and any procurement or replacement plans.

Return ONLY a JSON object (no markdown, no explanation):
{{
  "current_erp": "name of current ERP system, or Unknown",
  "contract_expiry": "contract end date if found (e.g. Mar 2026), else Unknown",
  "notes": "one precise sentence: most important finding about their ERP procurement situation"
}}"""


async def _enrich_with_perplexity(org: str, api_key: str) -> dict | None:
    """Perplexity sonar-online: one API call, live web search + synthesized answer."""
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, base_url="https://api.perplexity.ai")
        response = await client.chat.completions.create(
            model="llama-3.1-sonar-small-128k-online",
            messages=[{"role": "user", "content": _INTEL_PROMPT.format(org=org)}],
            max_tokens=200,
            temperature=0,
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            intel = json.loads(m.group())
            logger.debug(f"[enricher:perplexity] {org}: {intel.get('current_erp')} | {intel.get('contract_expiry')}")
            return intel
    except Exception as e:
        logger.warning(f"[enricher:perplexity] {org}: {type(e).__name__}: {e}")
    return None


async def _enrich_with_tavily_gpt(org: str, tavily_key: str, openai_key: str) -> dict | None:
    """Fallback: 2 Tavily searches → GPT-4o-mini synthesis."""
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
                    json={"api_key": tavily_key, "query": q, "search_depth": "basic", "max_results": 4},
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
        return None

    context = "\n\n".join(snippets[:6])
    prompt = f"""Organisation: {org}

Web research snippets:
{context}

{_INTEL_PROMPT.format(org=org)}"""

    try:
        oai = AsyncOpenAI(api_key=openai_key)
        response = await oai.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            intel = json.loads(m.group())
            logger.debug(f"[enricher:tavily+gpt] {org}: {intel.get('current_erp')}")
            return intel
    except Exception as e:
        logger.warning(f"[enricher:gpt] {org}: {type(e).__name__}: {e}")

    return None


async def enrich_buyer(signal: dict) -> dict:
    """
    Research a buying organisation and extract ERP intelligence.
    Tries Perplexity first (live web, one call).
    Falls back to Tavily + GPT-4o-mini if PERPLEXITY_API_KEY not set.
    Returns signal with 'buyer_intel' = {current_erp, contract_expiry, notes}.
    """
    org = (signal.get("org") or "").strip()
    if not org:
        return signal

    # Skip if already enriched from contract register (confirmed data — don't overwrite)
    existing = signal.get("buyer_intel")
    if existing and existing.get("current_erp") and existing.get("current_erp") != "Unknown":
        return signal

    perplexity_key = os.getenv("PERPLEXITY_API_KEY", "")
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    intel = None

    if perplexity_key:
        intel = await _enrich_with_perplexity(org, perplexity_key)
    elif tavily_key and openai_key:
        intel = await _enrich_with_tavily_gpt(org, tavily_key, openai_key)

    if intel:
        signal = {**signal, "buyer_intel": intel}

    return signal


async def enrich_signals(signals: list[dict]) -> list[dict]:
    """
    Enrich high-score signals with buyer intelligence.
    Only processes score >= 8 with a known org, max MAX_ENRICHMENTS per scan.
    """
    candidates = [s for s in signals if s.get("score", 0) >= 8 and s.get("org")]
    to_enrich = candidates[:MAX_ENRICHMENTS]

    if not to_enrich:
        return signals

    method = "Perplexity" if os.getenv("PERPLEXITY_API_KEY") else "Tavily+GPT"
    logger.info(f"[enricher] enriching {len(to_enrich)} buyers via {method} (of {len(candidates)} eligible)")

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
