import logging
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET

import requests

logger = logging.getLogger("find_video")

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# Substrings that show up on YouTube's cookie-consent / "before you continue"
# interstitial instead of real search results. If we see these, the scrape
# didn't fail loudly (status 200) but also didn't return anything useful —
# worth distinguishing from a genuine "no results" case in the logs.
_CONSENT_WALL_MARKERS = ("consent.youtube.com", "Before you continue to YouTube")


def search_videos(query, max_results=5):
    q = urllib.parse.quote_plus(query)
    url = f"https://www.youtube.com/results?search_query={q}"
    logger.info("Requesting YouTube search results | query=%r url=%s", query, url)

    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
    except requests.RequestException:
        logger.exception("Request to YouTube failed | query=%r", query)
        raise

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
    logger.info("Parsed %d raw video id matches (pre-dedupe) | query=%r", len(ids), query)

    out, seen = [], set()
    for vid in ids:
        if vid not in seen:
            seen.add(vid)
            out.append(vid)
            if len(out) >= max_results:
                break

    if not out:
        logger.warning(
            "search_videos found zero video ids | query=%r status=%s content_length=%s",
            query, r.status_code, len(r.content),
        )
    else:
        logger.info("search_videos returning %d id(s) | query=%r ids=%s", len(out), query, out)

    return out


def get_first_vid(query):
    video_ids = search_videos(query, max_results=1)
    if not video_ids:
        return None
    video_id = video_ids[0]
    VIDEO_URL = f"https://www.youtube.com/watch?v={video_id}"
    return VIDEO_URL


def get_first_video_id(query):
    video_ids = search_videos(query, max_results=1)
    if not video_ids:
        logger.warning("get_first_video_id: no results | query=%r", query)
        return None
    return video_ids[0]


def _build_query(phoneme):
    # Biasing the query toward educational/IPA content instead of a bare
    # phoneme symbol matters a lot here — an unqualified search for e.g. "r"
    # or "sh" returns mostly unrelated results. This still isn't a guarantee
    # of quality (unlike a curated channel-scoped map), so spot-check the
    # cache after a fresh warm-up.
    return f"{phoneme} phoneme pronunciation IPA sound how to say"


def get_video_for_phoneme(phoneme, cache_collection, force_refresh=False):
    """
    Returns a YouTube video_id teaching the given phoneme, using a Mongo
    cache so we only ever scrape YouTube once per phoneme rather than on
    every lesson load.

    cache_collection: the phoneme_video_cache collection from database.py
    """
    if not phoneme:
        logger.warning("get_video_for_phoneme called with no phoneme")
        return None

    if not force_refresh:
        cached = cache_collection.find_one({"phoneme": phoneme})
        if cached and cached.get("video_id"):
            logger.info("Cache hit | phoneme=%r video_id=%r", phoneme, cached["video_id"])
            return cached["video_id"]
        logger.info("Cache miss | phoneme=%r (cached_doc=%s)", phoneme, cached)

    query = _build_query(phoneme)
    try:
        video_id = get_first_video_id(query)
    except requests.RequestException as e:
        logger.error("[find_video] YouTube lookup failed for phoneme %r: %s", phoneme, e)
        return None

    if video_id:
        logger.info("Caching new video | phoneme=%r video_id=%r query=%r", phoneme, video_id, query)
        cache_collection.update_one(
            {"phoneme": phoneme},
            {"$set": {
                "phoneme": phoneme,
                "video_id": video_id,
                "query": query,
                "updated_at": time.time(),
            }},
            upsert=True,
        )
    else:
        logger.warning(
            "No video found for phoneme %r — nothing written to cache, "
            "caller will fall back to the default intro video.", phoneme
        )
    return video_id