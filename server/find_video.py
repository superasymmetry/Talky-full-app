import re
import requests
import urllib.parse
import xml.etree.ElementTree as ET

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

def search_videos(query, max_results=5):
    q = urllib.parse.quote_plus(query)
    r = requests.get(f"https://www.youtube.com/results?search_query={q}", headers=HEADERS, timeout=10)
    r.raise_for_status()
    ids = re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', r.text)
    out, seen = [], set()
    for vid in ids:
        if vid not in seen:
            seen.add(vid)
            out.append(vid)
            if len(out) >= max_results:
                break
    return out

def get_first_vid(query):
    video_ids = search_videos(query, max_results=1)
    if not video_ids:
        return None
    video_id = video_ids[0]
    VIDEO_URL = f"https://www.youtube.com/watch?v={video_id}"
    return VIDEO_URL