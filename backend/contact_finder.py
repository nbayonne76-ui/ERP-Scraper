"""
Contact Intelligence — find the decision-maker to call, not just the organisation.
Inspired by Cognism: the difference between a lead and a closed deal is having
the right person's name and contact details.

For each high-score signal, uses Exa neural search to find CIO/IT Director/CFO
mentions in public sources, then GPT-4o-mini extracts structured contact data.

Output per contact: name, title, email_pattern, linkedin_url, source.
"""
import os
import re
import json
import logging
import asyncio
import httpx

logger = logging.getLogger(__name__)

MAX_CONTACTS_PER_SCAN = 5  # preserve Exa free tier (1000/month)

_IT_ROLES = [
    "chief information officer", "CIO", "IT director", "head of IT",
    "digital director", "head of digital", "ICT director", "head of ICT",
    "chief digital officer", "CDO",
]
_FINANCE_ROLES = [
    "chief financial officer", "CFO", "director of finance",
    "head of finance", "s151 officer", "chief finance officer",
]

_EXTRACT_PROMPT = """You are identifying decision-makers at a UK public sector organisation for an ERP sales team.

Organisation: {org}

Web search results:
{context}

Extract IT and Finance decision-makers with REAL full names. Return ONLY a JSON array (no markdown):
[
  {{
    "name": "Full Name",
    "title": "Exact job title as mentioned",
    "linkedin_url": "https://linkedin.com/in/... only if explicitly found in the text, else null",
    "source": "e.g. council website, press release, LinkedIn, Companies House"
  }}
]

Rules:
- Only include people with REAL full names (first + last name)
- Focus on: CIO, IT Director, Head of IT, Digital Director, CDO, CFO, Director of Finance
- If a name appears multiple times with different titles, use the most recent/senior title
- Max 3 contacts, most senior first
- Return [] if no real full names found"""


def _email_pattern(name: str, org: str) -> str:
    """Generate the most likely email pattern for a UK public sector contact."""
    parts = name.lower().strip().split()
    if len(parts) < 2:
        return ""

    firstname, lastname = parts[0], parts[-1]
    # Strip accents/special chars
    firstname = re.sub(r"[^a-z]", "", firstname)
    lastname = re.sub(r"[^a-z]", "", lastname)

    # Derive domain slug from org name
    slug = org.lower()
    for suffix in [
        " county council", " city council", " borough council",
        " district council", " metropolitan borough council",
        " london borough of ", " london borough", " council",
        " combined authority", " unitary authority",
    ]:
        slug = slug.replace(suffix, "")
    slug = re.sub(r"[^a-z0-9]", "", slug.strip())

    if any(x in org.lower() for x in ["nhs", "trust", "hospital", "health", "icb"]):
        domain = f"{slug}.nhs.uk"
    else:
        domain = f"{slug}.gov.uk"

    return f"{firstname}.{lastname}@{domain}"


async def _search_contacts_exa(org: str, api_key: str) -> list[str]:
    """Two Exa searches: one for IT leaders, one for Finance leaders."""
    it_q = " OR ".join(f'"{r}"' for r in _IT_ROLES[:5])
    fin_q = " OR ".join(f'"{r}"' for r in _FINANCE_ROLES[:4])

    snippets: list[str] = []
    async with httpx.AsyncClient(timeout=20) as client:
        for query in [
            f'"{org}" ({it_q})',
            f'"{org}" ({fin_q})',
        ]:
            try:
                resp = await client.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": api_key, "Content-Type": "application/json"},
                    json={
                        "query": query,
                        "type": "neural",
                        "numResults": 5,
                        "useAutoprompt": False,
                        "contents": {"text": {"maxCharacters": 600}},
                    },
                )
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        text = item.get("text") or ""
                        title = item.get("title", "")
                        url = item.get("url", "")
                        if text:
                            snippets.append(f"[{title}] ({url})\n{text[:500]}")
            except Exception as e:
                logger.warning(f"[contacts:exa] {org}: {type(e).__name__}: {e}")

    return snippets


async def find_contacts(signal: dict) -> list[dict]:
    """
    Find decision-makers for a single signal's organisation.
    Returns list of contact dicts: {name, title, email_pattern, linkedin_url, source}.
    """
    org = (signal.get("org") or "").strip()
    if not org:
        return []

    exa_key = os.getenv("EXA_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not exa_key or not openai_key:
        return []

    snippets = await _search_contacts_exa(org, exa_key)
    if not snippets:
        return []

    context = "\n\n".join(snippets[:8])

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=400,
            temperature=0,
            messages=[{"role": "user", "content": _EXTRACT_PROMPT.format(org=org, context=context)}],
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if not m:
            return []

        contacts = json.loads(m.group())
        for c in contacts:
            if c.get("name"):
                c["email_pattern"] = _email_pattern(c["name"], org)

        logger.info(f"[contacts] {org}: {len(contacts)} decision-maker(s) found")
        return contacts[:3]

    except Exception as e:
        logger.warning(f"[contacts:gpt] {org}: {type(e).__name__}: {e}")
        return []


async def find_contacts_for_signals(signals: list[dict]) -> list[dict]:
    """
    Find contacts for the top high-score signals (max MAX_CONTACTS_PER_SCAN).
    Skips signals that already have contacts populated.
    """
    candidates = [
        s for s in signals
        if s.get("score", 0) >= 8
        and s.get("org")
        and not s.get("contacts")
    ]
    to_process = candidates[:MAX_CONTACTS_PER_SCAN]

    if not to_process:
        return signals

    logger.info(f"[contacts] finding decision-makers for {len(to_process)} orgs")

    results = await asyncio.gather(
        *[find_contacts(s) for s in to_process],
        return_exceptions=True,
    )

    # Build updated signal list
    updated = {id(s): s for s in signals}
    for i, result in enumerate(results):
        sig = to_process[i]
        if isinstance(result, Exception):
            logger.error(f"[contacts] {sig.get('org')}: {result}")
        elif result:
            updated[id(sig)] = {**sig, "contacts": result}

    return [updated.get(id(s), s) for s in signals]
