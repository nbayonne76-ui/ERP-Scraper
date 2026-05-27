"""
Web scrapers for UK ERP tender signals.
All sources are free / official APIs — no auth required except Companies House.
"""
import httpx
import feedparser
import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TIMEOUT = 20
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

NOW = lambda: datetime.now(timezone.utc).isoformat()

ERP_KEYWORDS = [
    "enterprise resource planning", "erp system", "erp solution", "erp software",
    "erp implementation", "erp replacement", "erp procurement", "erp selection",
    "finance system", "financial management system", "hr system", "payroll system",
    "back office system", "integrated business system", "procurement system",
    "unit4", "sap s/4", "sap erp", "oracle financials", "oracle erp", "dynamics 365",
    "workday", "infor", "sage 200", "sage intacct", "netsuite", "epicor",
    "digital transformation finance", "cloud migration erp",
]

ERP_BROAD = [
    "erp", "enterprise resource", "finance transformation", "back office",
    "agresso", "business world", "sun systems", "coda financials", "unit 4",
]


def _erp_score(text: str) -> int:
    """Quick pre-filter score: 0=ignore, 1=possible, 2=likely ERP."""
    t = text.lower()
    if any(kw in t for kw in ERP_KEYWORDS):
        return 2
    if any(kw in t for kw in ERP_BROAD):
        return 1
    return 0


def _extract_keywords(text: str) -> list[str]:
    t = text.lower()
    found = [kw for kw in ERP_KEYWORDS if kw in t]
    found += [kw for kw in ERP_BROAD if kw in t and kw not in found]
    return list(dict.fromkeys(found))[:8]


def _notice_url(base_domain: str, ocid: str) -> str:
    """Build a human-readable notice URL from an OCDS release."""
    notice_id = ocid.replace("ocds-b5fd17-", "").replace("ocds-h6vhtk-", "")
    if "contractsfinder" in base_domain:
        return f"https://www.contractsfinder.service.gov.uk/Notice/{notice_id}"
    return f"https://www.find-tender.service.gov.uk/Notice/{notice_id}"


def _parse_ocds_release(release: dict, source_name: str, base_domain: str) -> dict | None:
    """Extract signal from an OCDS release dict. Returns None if not ERP-relevant."""
    tender = release.get("tender", {})
    title = tender.get("title", "")
    description = tender.get("description", "")[:500]
    buyer = release.get("buyer", {}).get("name", "")
    ocid = release.get("ocid", "")
    published = release.get("date", "")[:10]
    tag = release.get("tag", [])
    value_obj = tender.get("value", {})
    value = f"£{value_obj.get('amount', 'TBC'):,}" if value_obj.get("amount") else "TBC"

    combined = title + " " + description
    score = _erp_score(combined)
    if score == 0:
        return None

    # Infer status from OCDS tag
    tag_str = " ".join(tag).lower() if tag else ""
    if "award" in tag_str:
        status = "Closed"
    elif "prior" in tag_str or "planning" in tag_str:
        status = "Pre-Market"
    else:
        status = "Active"

    return {
        "source": source_name,
        "title": title,
        "org": buyer,
        "url": _notice_url(base_domain, ocid),
        "summary": description,
        "sector": "Public",
        "keywords": _extract_keywords(combined),
        "published": published,
        "detected_at": NOW(),
        "value": value,
        "status": status,
    }


# ── 1. Find a Tender — OCDS API ───────────────────────────────────────────────

async def scrape_find_a_tender() -> list[dict]:
    """
    Official UK above-threshold procurement portal.
    OCDS paginated API — fetches latest 500 releases and filters for ERP.
    """
    base = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
    results = []
    cursor = None
    pages = 0

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            while pages < 5:  # max 5 pages × 100 = 500 releases
                params = {"limit": 100}
                if cursor:
                    params["cursor"] = cursor

                resp = await client.get(base, params=params, headers={"Accept": "application/json", "User-Agent": UA})
                resp.raise_for_status()
                data = resp.json()
                releases = data.get("releases", [])

                for release in releases:
                    signal = _parse_ocds_release(release, "Find a Tender", "find-tender")
                    if signal:
                        results.append(signal)

                next_url = data.get("links", {}).get("next")
                if not next_url or not releases:
                    break

                # Extract cursor from next URL
                import re
                m = re.search(r"cursor=([^&]+)", next_url)
                cursor = m.group(1) if m else None
                if not cursor:
                    break
                pages += 1

    except Exception as e:
        logger.warning(f"[find_a_tender] {type(e).__name__}: {e}")

    logger.info(f"[find_a_tender] {len(results)} ERP signals")
    return results


# ── 2. Contracts Finder — OCDS API ────────────────────────────────────────────

async def scrape_contracts_finder() -> list[dict]:
    """
    UK below-threshold + awarded contracts portal.
    Same OCDS format as Find a Tender, different base URL.
    """
    base = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search"
    results = []
    cursor = None
    pages = 0

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            while pages < 5:
                params = {"stages": "tender,planning", "limit": 100}
                if cursor:
                    params["cursor"] = cursor

                resp = await client.get(base, params=params, headers={"Accept": "application/json", "User-Agent": UA})
                resp.raise_for_status()
                data = resp.json()
                releases = data.get("releases", [])

                for release in releases:
                    signal = _parse_ocds_release(release, "Contracts Finder", "contractsfinder")
                    if signal:
                        results.append(signal)

                next_url = data.get("links", {}).get("next")
                if not next_url or not releases:
                    break

                import re
                m = re.search(r"cursor=([^&]+)", next_url)
                cursor = m.group(1) if m else None
                if not cursor:
                    break
                pages += 1

    except Exception as e:
        logger.warning(f"[contracts_finder] {type(e).__name__}: {e}")

    logger.info(f"[contracts_finder] {len(results)} ERP signals")
    return results


# ── 3. Google News RSS ────────────────────────────────────────────────────────

GOOGLE_NEWS_QUERIES = [
    ("Google News — ERP tender UK", "ERP tender procurement UK 2025 OR 2026"),
    ("Google News — ERP RFP UK gov", "ERP RFP ITT UK council NHS OR government"),
    ("Google News — ERP selection UK", "\"ERP selection\" OR \"finance system\" OR \"ERP replacement\" UK"),
    ("Google News — digital transformation UK", "\"digital transformation\" ERP finance system UK council OR NHS"),
    ("Google News — SAP Oracle Dynamics UK", "SAP OR Oracle OR \"Dynamics 365\" OR Unit4 UK procurement tender"),
]


async def scrape_google_news() -> list[dict]:
    results = []
    base = "https://news.google.com/rss/search?q={query}&hl=en-GB&gl=GB&ceid=GB:en"

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        for feed_name, query in GOOGLE_NEWS_QUERIES:
            try:
                import urllib.parse
                url = base.format(query=urllib.parse.quote(query))
                resp = await client.get(url, headers={"User-Agent": UA})
                feed = feedparser.parse(resp.text)

                for entry in feed.entries[:15]:
                    title = entry.get("title", "")
                    # Google News wraps summaries in HTML — strip tags
                    raw_summary = entry.get("summary", "")
                    import re
                    summary = re.sub(r"<[^>]+>", " ", raw_summary).strip()[:500]
                    url_e = entry.get("link", "")
                    published = entry.get("published", "")
                    org = entry.get("source", {}).get("title", "")

                    combined = title + " " + summary
                    if _erp_score(combined) == 0:
                        continue

                    results.append({
                        "source": feed_name,
                        "title": title,
                        "org": org,
                        "url": url_e,
                        "summary": summary,
                        "sector": "Unknown",
                        "keywords": _extract_keywords(combined),
                        "published": published,
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[google_news:{feed_name}] {type(e).__name__}: {e}")

    logger.info(f"[google_news] {len(results)} ERP signals")
    return results


# ── 4. Public Contracts Scotland — OCDS API ──────────────────────────────────

async def scrape_pcs() -> list[dict]:
    """
    Public Contracts Scotland — OCDS feed (same standard as CF and FAT).
    """
    results = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            # PCS uses the same OCDS pagination standard
            resp = await client.get(
                "https://www.publiccontractsscotland.gov.uk/ocds/",
                params={"limit": 100},
                headers={"Accept": "application/json", "User-Agent": UA}
            )
            if resp.status_code == 200:
                data = resp.json()
                for release in data.get("releases", []):
                    signal = _parse_ocds_release(release, "Public Contracts Scotland", "pcs")
                    if signal:
                        results.append(signal)
            else:
                # Fallback: search RSS via keyword URL
                resp2 = await client.get(
                    "https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx",
                    params={"searchType": "2", "keyword": "ERP enterprise resource planning"},
                    headers={"User-Agent": UA}
                )
                logger.debug(f"[pcs] fallback status: {resp2.status_code}")
    except Exception as e:
        logger.warning(f"[pcs] {type(e).__name__}: {e}")

    logger.info(f"[pcs] {len(results)} ERP signals")
    return results


# ── 5. Sell2Wales — OCDS API ─────────────────────────────────────────────────

async def scrape_sell2wales() -> list[dict]:
    results = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                "https://www.sell2wales.gov.wales/ocds/",
                params={"limit": 100},
                headers={"Accept": "application/json", "User-Agent": UA}
            )
            if resp.status_code == 200:
                data = resp.json()
                for release in data.get("releases", []):
                    signal = _parse_ocds_release(release, "Sell2Wales", "sell2wales")
                    if signal:
                        results.append(signal)
            else:
                logger.debug(f"[sell2wales] status {resp.status_code} — portal may not expose OCDS")
    except Exception as e:
        logger.warning(f"[sell2wales] {type(e).__name__}: {e}")

    logger.info(f"[sell2wales] {len(results)} ERP signals")
    return results


# ── 6. Job postings — ERP intent signals ─────────────────────────────────────

JOB_RSS_FEEDS = [
    ("Jobs — ERP Project Manager UK", "https://www.cv-library.co.uk/rss-jobs?q=ERP+project+manager&l=UK&distance=200&order=date"),
    ("Jobs — ERP System Selection UK", "https://www.cwjobs.co.uk/jobs/rss?keywords=ERP+system+selection&location=UK&distance=200"),
    ("Jobs — Finance System UK", "https://www.totaljobs.com/jobs/erp-implementation/rss?distance=200&searchRadius=200"),
]

JOB_INTENT_KEYWORDS = [
    "erp", "enterprise resource planning", "system selection", "system replacement",
    "finance system", "hr system", "erp implementation", "erp project",
    "business systems", "oracle", "sap", "dynamics 365", "unit4", "workday",
]


async def scrape_job_postings() -> list[dict]:
    """
    Job postings for ERP roles are strong intent signals:
    'ERP Project Manager - System Selection' = organisation actively selecting an ERP.
    """
    results = []
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        for feed_name, feed_url in JOB_RSS_FEEDS:
            try:
                resp = await client.get(feed_url, headers={"User-Agent": UA})
                feed = feedparser.parse(resp.text)
                for entry in feed.entries[:20]:
                    title = entry.get("title", "")
                    summary = entry.get("summary", "")[:400]
                    url_e = entry.get("link", "")
                    published = entry.get("published", "")
                    # Org often in title: "ERP Project Manager | Manchester City Council"
                    org = ""
                    if "|" in title:
                        org = title.split("|")[-1].strip()
                    elif " - " in title:
                        org = title.split(" - ")[-1].strip()

                    combined = title + " " + summary
                    if not any(kw in combined.lower() for kw in JOB_INTENT_KEYWORDS):
                        continue

                    results.append({
                        "source": feed_name,
                        "title": title,
                        "org": org,
                        "url": url_e,
                        "summary": f"[JOB POSTING] {summary}",
                        "sector": "Unknown",
                        "keywords": _extract_keywords(combined),
                        "published": published,
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[jobs:{feed_name}] {type(e).__name__}: {e}")

    logger.info(f"[jobs] {len(results)} ERP job signals")
    return results


# ── 7. Companies House — leadership changes at key orgs ──────────────────────

async def scrape_companies_house() -> list[dict]:
    """
    Watch for new CIO/CFO/CDO appointments at known ERP-relevant organisations.
    New digital leadership = high probability of ERP review within 12 months.
    Requires free API key from developer.company-information.service.gov.uk
    """
    api_key = os.getenv("COMPANIES_HOUSE_API_KEY", "")
    if not api_key:
        return []

    results = []
    # Watch for new officer appointments at orgs with recent ERP signals
    # SIC 84110 = central government, 84120 = local government, 86101 = NHS
    officer_queries = [
        ("ERP Director", "chief information officer digital transformation"),
        ("Finance Director", "chief financial officer finance director"),
    ]

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            for label, q in officer_queries:
                resp = await client.get(
                    "https://api.company-information.service.gov.uk/search/officers",
                    params={"q": q, "items_per_page": 20},
                    auth=(api_key, ""),
                )
                if resp.status_code == 200:
                    for item in resp.json().get("items", []):
                        name = item.get("title", "")
                        company_number = item.get("company_number", "")
                        if not company_number:
                            continue
                        url_e = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}"
                        results.append({
                            "source": f"Companies House — {label}",
                            "title": f"New appointment: {name}",
                            "org": item.get("company_name", ""),
                            "url": url_e,
                            "summary": f"Role: {item.get('officer_role','').replace('_',' ')} | Appointed: {item.get('appointment_date','')} | {item.get('address_snippet','')}",
                            "sector": "Unknown",
                            "keywords": ["erp", "leadership change"],
                            "published": item.get("appointment_date", ""),
                            "detected_at": NOW(),
                        })
    except Exception as e:
        logger.warning(f"[companies_house] {type(e).__name__}: {e}")

    logger.info(f"[companies_house] {len(results)} signals")
    return results


# ── 8. WhatDoTheyKnow — FOI requests as procurement signals ──────────────────

async def scrape_whatdotheyknow() -> list[dict]:
    """
    FOI requests on WhatDoTheyKnow mentioning ERP/finance systems = org researching costs.
    Strong pre-procurement signal (6-18 months before formal tender).
    """
    results = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                "https://www.whatdotheyknow.com/feed/latest",
                headers={"User-Agent": UA}
            )
            feed = feedparser.parse(resp.text)
            for entry in feed.entries[:30]:
                title = entry.get("title", "")
                summary = entry.get("summary", "")[:400]
                url_e = entry.get("link", "")
                published = entry.get("published", "")
                combined = title + " " + summary
                if _erp_score(combined) == 0:
                    continue
                results.append({
                    "source": "WhatDoTheyKnow FOI",
                    "title": f"FOI: {title}",
                    "org": entry.get("author", ""),
                    "url": url_e,
                    "summary": f"[FOI REQUEST] {summary}",
                    "sector": "Public",
                    "keywords": _extract_keywords(combined),
                    "published": published,
                    "detected_at": NOW(),
                })
    except Exception as e:
        logger.warning(f"[whatdotheyknow] {type(e).__name__}: {e}")

    logger.info(f"[whatdotheyknow] {len(results)} ERP signals")
    return results


# ── Master runner ─────────────────────────────────────────────────────────────

async def run_all_scrapers() -> tuple[list[dict], list[str]]:
    """Run all scrapers concurrently. Returns (signals, sources_with_results)."""
    import asyncio

    scrapers = {
        "Find a Tender": scrape_find_a_tender(),
        "Contracts Finder": scrape_contracts_finder(),
        "Google News": scrape_google_news(),
        "Job Postings": scrape_job_postings(),
        "PCS Scotland": scrape_pcs(),
        "Sell2Wales": scrape_sell2wales(),
        "WhatDoTheyKnow": scrape_whatdotheyknow(),
        "Companies House": scrape_companies_house(),
        "Tavily Search": scrape_tavily(),
        "Brave Search": scrape_brave_search(),
        "Firecrawl": scrape_firecrawl(),
        "Crawl4AI": scrape_crawl4ai(),
    }

    all_signals = []
    sources_ok = []

    results = await asyncio.gather(*scrapers.values(), return_exceptions=True)
    for name, result in zip(scrapers.keys(), results):
        if isinstance(result, Exception):
            logger.error(f"[scraper:{name}] uncaught: {result}")
        elif result:
            all_signals.extend(result)
            sources_ok.append(f"{name}({len(result)})")
            logger.info(f"[scraper:{name}] {len(result)} signals")
        else:
            logger.debug(f"[scraper:{name}] 0 signals")

    # Deduplicate by URL, fallback to title hash
    seen = set()
    deduped = []
    for s in all_signals:
        key = s.get("url") or s.get("title", "")[:80]
        if key and key not in seen:
            seen.add(key)
            deduped.append(s)

    logger.info(f"[scrapers] total: {len(all_signals)} raw → {len(deduped)} after dedup")
    return deduped, sources_ok


# ── 9. Tavily — AI-native web search ─────────────────────────────────────────

TAVILY_QUERIES = [
    "ERP tender procurement UK 2026",
    "ERP system selection UK council NHS hospital",
    "enterprise resource planning RFP ITT UK public sector",
    "digital transformation finance system UK government",
    "SAP OR Oracle OR Dynamics365 OR Unit4 procurement UK tender",
]


async def scrape_tavily() -> list[dict]:
    """
    Tavily Search API — purpose-built for AI agents.
    Returns rich, citation-ready snippets with real-time web results.
    Requires TAVILY_API_KEY (free tier: 1000 searches/month).
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        logger.info("[tavily] no TAVILY_API_KEY — skipped")
        return []

    results = []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for query in TAVILY_QUERIES:
            try:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": query,
                        "search_depth": "advanced",
                        "include_raw_content": False,
                        "max_results": 8,
                        "include_domains": [],
                        "exclude_domains": [],
                    },
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code != 200:
                    logger.warning(f"[tavily] HTTP {resp.status_code} for query: {query[:40]}")
                    continue

                data = resp.json()
                for item in data.get("results", []):
                    title = item.get("title", "")
                    content = item.get("content", "")[:500]
                    combined = title + " " + content
                    if _erp_score(combined) == 0:
                        continue
                    results.append({
                        "source": "Tavily Search",
                        "title": title,
                        "org": "",
                        "url": item.get("url", ""),
                        "summary": content,
                        "sector": "Unknown",
                        "keywords": _extract_keywords(combined),
                        "published": item.get("published_date", ""),
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[tavily] {type(e).__name__}: {e}")

    logger.info(f"[tavily] {len(results)} ERP signals")
    return results


# ── 10. Brave Search — independent search index ───────────────────────────────

BRAVE_QUERIES = [
    "ERP tender UK 2026 site:find-tender.service.gov.uk OR site:contractsfinder.service.gov.uk",
    "enterprise resource planning procurement UK council 2026",
    "ERP implementation project manager UK public sector hiring",
    "finance system replacement UK NHS OR council OR government 2026",
]


async def scrape_brave_search() -> list[dict]:
    """
    Brave Search API — fastest latency, independent index (no Google).
    Requires BRAVE_API_KEY (free tier available at api.search.brave.com).
    """
    api_key = os.getenv("BRAVE_API_KEY", "")
    if not api_key:
        logger.info("[brave] no BRAVE_API_KEY — skipped")
        return []

    results = []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for query in BRAVE_QUERIES:
            try:
                resp = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": query, "count": 10, "freshness": "pm", "text_decorations": False},
                    headers={
                        "X-Subscription-Token": api_key,
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                    },
                )
                if resp.status_code != 200:
                    logger.warning(f"[brave] HTTP {resp.status_code} for query: {query[:40]}")
                    continue

                data = resp.json()
                for item in data.get("web", {}).get("results", []):
                    title = item.get("title", "")
                    description = item.get("description", "")[:500]
                    combined = title + " " + description
                    if _erp_score(combined) == 0:
                        continue
                    results.append({
                        "source": "Brave Search",
                        "title": title,
                        "org": "",
                        "url": item.get("url", ""),
                        "summary": description,
                        "sector": "Unknown",
                        "keywords": _extract_keywords(combined),
                        "published": item.get("age", ""),
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[brave] {type(e).__name__}: {e}")

    logger.info(f"[brave] {len(results)} ERP signals")
    return results


# ── 11. Firecrawl — JS-rendered portal scraping ───────────────────────────────

FIRECRAWL_SEARCH_QUERIES = [
    "ERP enterprise resource planning tender UK 2026",
    "finance system procurement UK public sector 2026",
    "ERP selection ITT RFP UK council NHS",
]

FIRECRAWL_SCRAPE_URLS = [
    "https://bidstats.uk/tenders?q=ERP+enterprise+resource+planning&status=live",
    "https://www.digitalmarketplace.service.gov.uk/buyers/direct-award/cloud/search?q=erp",
]


async def scrape_firecrawl() -> list[dict]:
    """
    Firecrawl — turns JS-heavy portals into clean LLM-ready markdown.
    Handles Cloudflare, pagination, and structured extraction.
    Requires FIRECRAWL_API_KEY (free tier: 10 scrapes/min at firecrawl.dev).
    """
    api_key = os.getenv("FIRECRAWL_API_KEY", "")
    if not api_key:
        logger.info("[firecrawl] no FIRECRAWL_API_KEY — skipped")
        return []

    results = []
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # AI-powered search — finds and extracts ERP-relevant pages
        for query in FIRECRAWL_SEARCH_QUERIES:
            try:
                resp = await client.post(
                    "https://api.firecrawl.dev/v1/search",
                    headers=headers,
                    json={"query": query, "limit": 8, "scrapeOptions": {"formats": ["markdown"]}},
                )
                if resp.status_code != 200:
                    logger.warning(f"[firecrawl] search HTTP {resp.status_code}: {query[:40]}")
                    continue

                data = resp.json()
                for item in (data.get("data") or []):
                    title = item.get("title", "") or item.get("metadata", {}).get("title", "")
                    content = (item.get("markdown") or item.get("description", ""))[:500]
                    combined = title + " " + content
                    if _erp_score(combined) == 0:
                        continue
                    results.append({
                        "source": "Firecrawl Search",
                        "title": title,
                        "org": "",
                        "url": item.get("url", ""),
                        "summary": content,
                        "sector": "Unknown",
                        "keywords": _extract_keywords(combined),
                        "published": item.get("metadata", {}).get("publishedDate", ""),
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[firecrawl:search] {type(e).__name__}: {e}")

        # Direct scrape of JS-heavy procurement portals
        for url in FIRECRAWL_SCRAPE_URLS:
            try:
                resp = await client.post(
                    "https://api.firecrawl.dev/v1/scrape",
                    headers=headers,
                    json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
                )
                if resp.status_code != 200:
                    logger.warning(f"[firecrawl] scrape HTTP {resp.status_code}: {url}")
                    continue

                data = resp.json()
                content = (data.get("data", {}).get("markdown") or "")[:3000]
                title = data.get("data", {}).get("metadata", {}).get("title", url)

                # Split into blocks and filter for ERP-relevant lines
                blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
                for block in blocks:
                    if _erp_score(block) == 0:
                        continue
                    results.append({
                        "source": "Firecrawl Scrape",
                        "title": block[:120],
                        "org": "",
                        "url": url,
                        "summary": block[:500],
                        "sector": "Public",
                        "keywords": _extract_keywords(block),
                        "published": "",
                        "detected_at": NOW(),
                    })
            except Exception as e:
                logger.warning(f"[firecrawl:scrape] {type(e).__name__}: {e}")

    logger.info(f"[firecrawl] {len(results)} ERP signals")
    return results


# ── 12. Crawl4AI — JS portals, free, self-hosted ──────────────────────────────

CRAWL4AI_TARGETS = [
    {
        "name": "BidStats.uk",
        "url": "https://bidstats.uk/tenders?q=ERP+enterprise+resource+planning&status=live",
        "sector": "Public",
    },
    {
        "name": "Digital Marketplace G-Cloud",
        "url": "https://www.digitalmarketplace.service.gov.uk/g-cloud/search?q=erp+enterprise+resource+planning",
        "sector": "Public",
    },
    {
        "name": "TED Europa UK ERP",
        "url": "https://ted.europa.eu/en/search/result?scope=NOTICE&fullText=ERP+enterprise+resource+planning+United+Kingdom&sortField=ND&sortOrder=LATEST",
        "sector": "Public",
    },
]


async def scrape_crawl4ai() -> list[dict]:
    """
    Crawl4AI — 100% free, self-hosted, no API key.
    Handles JS rendering, anti-bot (3-tier), Shadow DOM.
    Targets JS-heavy portals that raw httpx cannot scrape.
    Gracefully skips if crawl4ai is not installed.
    """
    try:
        from crawl4ai import AsyncWebCrawler, CacheMode
    except ImportError:
        logger.warning("[crawl4ai] not installed — run: pip install crawl4ai && python3 -m playwright install chromium")
        return []

    results = []

    try:
        async with AsyncWebCrawler(headless=True, verbose=False) as crawler:
            for target in CRAWL4AI_TARGETS:
                try:
                    result = await crawler.arun(
                        url=target["url"],
                        cache_mode=CacheMode.BYPASS,
                        word_count_threshold=8,
                        excluded_tags=["nav", "footer", "header", "script", "style"],
                        remove_overlay_elements=True,
                        wait_until="networkidle",
                    )

                    if not result.success:
                        logger.warning(f"[crawl4ai] {target['name']}: {result.error_message}")
                        continue

                    markdown = result.markdown or ""
                    # Split into blocks and filter ERP-relevant ones
                    blocks = [b.strip() for b in markdown.split("\n\n") if len(b.strip()) > 40]

                    seen_block_keys = set()
                    for block in blocks:
                        if _erp_score(block) == 0:
                            continue
                        # Dedup similar blocks
                        block_key = block[:60]
                        if block_key in seen_block_keys:
                            continue
                        seen_block_keys.add(block_key)

                        title = block[:120].replace("\n", " ").strip()
                        results.append({
                            "source": f"Crawl4AI — {target['name']}",
                            "title": title,
                            "org": "",
                            "url": target["url"],
                            "summary": block[:500],
                            "sector": target["sector"],
                            "keywords": _extract_keywords(block),
                            "published": "",
                            "detected_at": NOW(),
                        })

                except Exception as e:
                    logger.warning(f"[crawl4ai:{target['name']}] {type(e).__name__}: {e}")

    except Exception as e:
        logger.warning(f"[crawl4ai] browser init failed: {type(e).__name__}: {e}")

    logger.info(f"[crawl4ai] {len(results)} ERP signals")
    return results
