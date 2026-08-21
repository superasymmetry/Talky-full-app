from functools import wraps
from flask import request, jsonify, g
import requests
from jose import jwt
import os
import logging
import time
import threading

logger = logging.getLogger("auth")

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
API_AUDIENCE = os.getenv("API_AUDIENCE") or os.getenv("AUTH0_AUDIENCE")
ALGORITHMS = ["RS256"]

JWKS_TTL_SECONDS = 3600

_jwks = None
_jwks_fetched_at = 0
_jwks_lock = threading.Lock()


class AuthError(Exception):
    def __init__(self, message, status_code):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_jwks(force_refresh=False):
    # re fetches the JWKS so it's not stale, otherwise fetch from cache
    global _jwks, _jwks_fetched_at
    now = time.monotonic()
    if _jwks is None or force_refresh or (now - _jwks_fetched_at) > JWKS_TTL_SECONDS:
        with _jwks_lock:
            now = time.monotonic()
            if _jwks is None or force_refresh or (now - _jwks_fetched_at) > JWKS_TTL_SECONDS:
                resp = requests.get(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json", timeout=10)
                resp.raise_for_status()
                _jwks = resp.json()
                _jwks_fetched_at = now
    return _jwks


def _find_rsa_key(jwks, kid):
    for key in jwks["keys"]:
        if key["kid"] == kid:
            return {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"],
            }
    return None


def verify_token(token):
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    jwks = get_jwks()
    rsa_key = _find_rsa_key(jwks, kid)
    if not rsa_key:
        jwks = get_jwks(force_refresh=True)
        rsa_key = _find_rsa_key(jwks, kid)
    if not rsa_key:
        raise AuthError("Appropriate key not found", 401)

    try:
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
    except Exception as e:
        logger.info("Token verification failed: %s", e)
        raise AuthError("Token verification failed", 401)
    return payload


def requires_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", None)
        if not auth:
            return jsonify({"message": "Missing Authorization header"}), 401
        parts = auth.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"message": "Invalid Authorization header"}), 401
        token = parts[1]
        try:
            payload = verify_token(token)
        except AuthError as e:
            return jsonify({"message": e.message}), e.status_code
        except Exception:
            logger.exception("Unexpected error during token verification")
            return jsonify({"message": "Token verification failed"}), 401

        # attach payload to flask.g for handlers
        g.current_user = payload
        return f(*args, **kwargs)
    return wrapper
