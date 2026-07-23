import hashlib
import logging
import os
import re
import time
import urllib.parse

import requests

logger = logging.getLogger("find_video")

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
_CONSENT_WALL_MARKERS = ("consent.youtube.com", "Before you continue to YouTube")

# If set, use the official YouTube Data API instead of scraping search HTML.
# Far more reliable (no consent-wall failures) and lets us filter by
# duration/safe-search server-side instead of guessing from title text.
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

# Title substrings that reliably mean "not a kid-appropriate phonics clip"
# even though the search matched — cheap filter, especially useful in
# scrape mode where we have no real duration/category metadata.
_BLOCKLIST_TERMS = (
    "trailer", "official video", "official music video", "full movie",
    "lyrics", "compilation", "18+", "prank", "reaction",
)

# Known-good channels for short kid-appropriate phonics/pronunciation
# content. Used to rank results (API mode) — extend this list over time
# rather than trusting arbitrary search results.
PREFERRED_CHANNELS = (
    "Jack Hartmann Kids Music Channel",
    "Speech Blubs",
    "Twinkl",
    "Boom Learning",
    "Mommy Speech Therapy",
)


def _word_key(words):
    """Stable short key for a lesson's target words, so different word sets
    for the same phoneme (e.g. lion/leaf/lamp vs. yellow/ball/silly) get
    their own cached video instead of sharing one forever.

    IMPORTANT: hash the FULL word set, not a truncated slice. Truncating
    after sorting (the old `[:limit]` behavior) meant two lessons on the
    same phoneme whose extra/different words happened to sort after the
    cutoff would collide onto the same cache key — which is what was
    causing neighboring lessons to serve each other's videos. Hashing is
    cheap regardless of how many words go in, so there's no real reason to
    truncate first.
    """
    cleaned = sorted({w.strip().lower() for w in words if w and w.strip()})
    if not cleaned:
        return "generic"
    return hashlib.sha1("-".join(cleaned).encode("utf-8")).hexdigest()[:12]


def _build_query(phoneme, words):
    """Bias toward short, kid-friendly phonics content and toward the
    lesson's actual target words — a bare IPA symbol search ("ʃ
    pronunciation") returns mostly unrelated linguistics content and never
    varies between lessons on the same sound."""
    example_words = [w for w in dict.fromkeys(words) if w][:3]
    words_part = " ".join(example_words)
    if words_part:
        return f'"{phoneme}" sound {words_part} pronunciation for kids speech therapy'
    return f'"{phoneme}" phoneme sound pronunciation for kids speech therapy'


def _looks_blocklisted(title):
    t = (title or "").lower()
    return any(term in t for term in _BLOCKLIST_TERMS)


def _search_via_api(query, max_results=5):
    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": max_results,
        "videoDuration": "short",   # < 4 min — rules out movies/full lectures
        "safeSearch": "strict",
        "relevanceLanguage": "en",
        "key": YOUTUBE_API_KEY,
    }
    r = requests.get("https://www.googleapis.com/youtube/v3/search", params=params, timeout=10)
    r.raise_for_status()
    out = []
    for item in r.json().get("items", []):
        vid = item.get("id", {}).get("videoId")
        title = item.get("snippet", {}).get("title", "")
        channel = item.get("snippet", {}).get("channelTitle", "")
        if not vid or _looks_blocklisted(title):
            continue
        out.append({"video_id": vid, "title": title, "channel": channel})
    out.sort(key=lambda v: v["channel"] not in PREFERRED_CHANNELS)  # preferred channels first
    return out


def _search_via_scrape(query, max_results=5):
    """Fallback when no API key is configured. Fragile by nature (consent
    walls, HTML layout drift) — prefer YOUTUBE_API_KEY if at all possible."""
    q = urllib.parse.quote_plus(query)
    url = f"https://www.youtube.com/results?search_query={q}"
    logger.info("Requesting YouTube search results | query=%r url=%s", query, url)

    r = requests.get(url, headers=HEADERS, timeout=10)
    logger.info(
        "YouTube response | query=%r status=%s content_length=%s final_url=%s",
        query, r.status_code, len(r.content), r.url,
    )
    r.raise_for_status()

    if any(marker in r.text for marker in _CONSENT_WALL_MARKERS):
        logger.warning(
            "YouTube returned a consent/interstitial page instead of results "
            "(likely IP/cookie-based) | query=%r", query
        )

    ids = re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', r.text)
    out, seen = [], set()
    for vid in ids:
        if vid in seen:
            continue
        seen.add(vid)
        idx = r.text.find(vid)
        window = r.text[idx: idx + 800]
        title_match = re.search(r'"text":"([^"]{3,120})"', window)
        title = title_match.group(1) if title_match else ""
        if _looks_blocklisted(title):
            continue
        out.append({"video_id": vid, "title": title, "channel": ""})
        if len(out) >= max_results:
            break

    if not out:
        logger.warning(
            "search_videos found zero usable video ids | query=%r status=%s content_length=%s",
            query, r.status_code, len(r.content),
        )
    return out


def search_videos(query, max_results=5):
    if YOUTUBE_API_KEY:
        try:
            return _search_via_api(query, max_results)
        except requests.RequestException:
            logger.exception("YouTube Data API search failed, falling back to scrape | query=%r", query)
    return _search_via_scrape(query, max_results)


def get_first_vid(query):
    results = search_videos(query, max_results=1)
    return f"https://www.youtube.com/watch?v={results[0]['video_id']}" if results else None


def get_first_video_id(query):
    results = search_videos(query, max_results=1)
    if not results:
        logger.warning("get_first_video_id: no results | query=%r", query)
        return None
    return results[0]["video_id"]


def get_video_for_phoneme(phoneme, cache_collection, words=None, force_refresh=False):
    """
    Returns a YouTube video_id for the given phoneme + the lesson's target
    words, using a Mongo cache keyed on BOTH — so a given (phoneme, word-set)
    combo is scraped once ever, but different word sets on the same phoneme
    get their own video instead of all sharing one.
    """
    if not phoneme:
        logger.warning("get_video_for_phoneme called with no phoneme")
        return None

    words = words or []
    word_key = _word_key(words)
    cache_query = {"phoneme": phoneme, "word_key": word_key}

    if not force_refresh:
        cached = cache_collection.find_one(cache_query)
        if cached and cached.get("video_id"):
            logger.info("Cache hit | phoneme=%r word_key=%r video_id=%r", phoneme, word_key, cached["video_id"])
            return cached["video_id"]
        logger.info("Cache miss | phoneme=%r word_key=%r", phoneme, word_key)

    query = _build_query(phoneme, words)
    try:
        results = search_videos(query, max_results=5)
    except requests.RequestException:
        logger.exception("[find_video] YouTube lookup failed for phoneme %r", phoneme)
        return None

    if not results:
        logger.warning(
            "No video found for phoneme %r words=%r — nothing cached, "
            "caller falls back to the default intro video.", phoneme, words
        )
        return None

    video_id = results[0]["video_id"]
    logger.info(
        "Caching new video | phoneme=%r word_key=%r video_id=%r query=%r title=%r",
        phoneme, word_key, video_id, query, results[0].get("title"),
    )
    cache_collection.update_one(
        cache_query,
        {"$set": {
            "phoneme": phoneme,
            "word_key": word_key,
            "words": words,
            "video_id": video_id,
            "title": results[0].get("title"),
            "query": query,
            "updated_at": time.time(),
        }},
        upsert=True,
    )
    return video_id