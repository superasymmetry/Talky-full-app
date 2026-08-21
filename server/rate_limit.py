# in-memory per-IP rate limiter.
import time
import threading
from collections import defaultdict, deque
from functools import wraps

from flask import request, jsonify

_hits = defaultdict(deque)
_lock = threading.Lock()


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limited(key_prefix, max_requests, window_seconds):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            key = f"{key_prefix}:{_client_ip()}"
            now = time.monotonic()
            with _lock:
                q = _hits[key]
                while q and now - q[0] > window_seconds:
                    q.popleft()
                if len(q) >= max_requests:
                    return jsonify({"error": "Too many requests, please slow down and try again shortly."}), 429
                q.append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator
