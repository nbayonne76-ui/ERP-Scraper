"""
Buyer intelligence enrichment.
For high-score signals (>=8), researches the buying organisation's ERP situation.

Priority chain (all free):
  1. Exa.ai + GPT-4o-mini    — neural search, finds board papers & IT strategies
  2. Jina Search + GPT-4o-mini — 100% free, no API key, web search + content
  3. Tavily + GPT-4o-mini    — standard search fallback
  4. Skip                    — if OPENAI_API_KEY not set

Capped at MAX_ENRICHMENTS per scan to preserve free-tier quotas.
"""
import os
import json
import re
import logging
import asyncio
import urllib.parse

logger = logging.getLogger(__name__)

MAX_ENRICHMENTS = 5

_SYNTHESIS_PROMPT = """You are analysing research snippets about a UK public sector organisation.

Organisation: {org}

Research findings:
{context}

Extract what you can and return ONLY a JSON object (no markdown):
{{
  "current_erp": "name of their current ERP/finance system, or Unknown",
  "contract_expiry": "contract end date if found (e.g. Mar 2026), else Unknown",
  "notes": "one precise sentence: most important finding about their ERP procurement situation"
}}"""


async def _synthesise_with_gpt(org: str, snippets: list[str], openai_key: str) -> dict | None:
    """Synthesise research snippets into structured buyer intel using GPT-4o-mini."""
    from openai import AsyncOpenAI
    context = "\n\n".join(snippets[:6])
    try:
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            temperature=0,
            messages=[{"role": "user", "content": _SYNTHESIS_PROMPT.format(org=org, context=context)}],
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        logger.warning(f"[enricher:gpt] {org}: {type(e).__name__}: {e}")
    return None


async def _research_with_exa(org: str, api_key: str) -> list[str]:
    """Use Exa neural search to find relevant documents about the org's ERP situation."""
    import httpx
    queries = [
        f"{org} ERP finance system contract expiry replacement",
        f"{org} digital transformation ICT strategy procurement",
    ]
    snippets: list[str] = []
    async with httpx.AsyncClient(timeout=20) as client:
        for query in queries:
            try:
                resp = await client.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": api_key, "Content-Type": "application/json"},
                    json={
                        "query": query,
                        "type": "neural",
                        "numResults": 4,
                        "useAutoprompt": True,
                        "contents": {"text": {"maxCharacters": 600}},
                    },
                )
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        text = item.get("text") or ""
                        title = item.get("title", "")
                        if text:
                            snippets.append(f"{title}\n{text[:500]}")
            except Exception as e:
                logger.warning(f"[enricher:exa] {org}: {type(e).__name__}: {e}")
    return snippets


async def _research_with_jina(org: str) -> list[str]:
    """
    Jina AI Search — completely free, no API key.
    s.jina.ai converts web search results into clean LLM-ready text.
    """
    import httpx
    queries = [
        f"{org} ERP finance system contract",
        f"{org} digital transformation procurement",
    ]
    snippets: list[str] = []
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        for query in queries:
            try:
                url = f"https://s.jina.ai/{urllib.parse.quote(query)}"
                resp = await client.get(
                    url,
                    headers={
                        "Accept": "application/json",
                        "X-With-Links-Summary": "false",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for item in (data.get("data") or [])[:4]:
                        content = item.get("content") or item.get("description", "")
                        title = item.get("title", "")
                        if content:
                            snippets.append(f"{title}\n{content[:500]}")
            except Exception as e:
                logger.warning(f"[enricher:jina] {org}: {type(e).__name__}: {e}")
    return snippets


async def _research_with_tavily(org: str, tavily_key: str) -> list[str]:
    """Tavily standard search fallback."""
    import httpx
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
    return snippets


async def enrich_buyer(signal: dict) -> dict:
    """
    Research a buying organisation and extract ERP intelligence.
    Priority: Exa → Jina (free) → Tavily.
    All routes synthesised by GPT-4o-mini.
    Skips signals already enriched from a contract register (confirmed data).
    """
    org = (signal.get("org") or "").strip()
    if not org:
        return signal

    # Don't overwrite confirmed contract register data
    existing = signal.get("buyer_intel")
    if existing and existing.get("current_erp") and existing.get("current_erp") != "Unknown":
        return signal

    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        return signal

    exa_key = os.getenv("EXA_API_KEY", "")
    tavily_key = os.getenv("TAVILY_API_KEY", "")

    snippets: list[str] = []

    if exa_key:
        snippets = await _research_with_exa(org, exa_key)
        method = "exa"

    if not snippets:
        snippets = await _research_with_jina(org)
        method = "jina"

    if not snippets and tavily_key:
        snippets = await _research_with_tavily(org, tavily_key)
        method = "tavily"

    if not snippets:
        return signal

    intel = await _synthesise_with_gpt(org, snippets, openai_key)
    if intel:
        logger.debug(f"[enricher:{method}] {org}: {intel.get('current_erp')} | {intel.get('contract_expiry')}")
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

    exa_key = os.getenv("EXA_API_KEY", "")
    method = "Exa+GPT" if exa_key else "Jina+GPT"
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
