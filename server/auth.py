from functools import wraps
from flask import request, jsonify, g
import requests
from jose import jwt
import os

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
API_AUDIENCE = os.getenv("API_AUDIENCE") or os.getenv("AUTH0_AUDIENCE")
ALGORITHMS = ["RS256"]

_jwks = None
def get_jwks():
    global _jwks
    if _jwks is None:
        resp = requests.get(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json", timeout=10)
        resp.raise_for_status()
        _jwks = resp.json()
    return _jwks

def requires_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", None)
        if not auth:
            return jsonify({"message": "Missing Authorization header"}), 401
        parts = auth.split()
        if parts[0].lower() != "bearer" or len(parts) != 2:
            return jsonify({"message": "Invalid Authorization header"}), 401
        token = parts[1]
        try:
            jwks = get_jwks()
            unverified_header = jwt.get_unverified_header(token)
            rsa_key = {}
            for key in jwks["keys"]:
                if key["kid"] == unverified_header.get("kid"):
                    rsa_key = {
                        "kty": key["kty"],
                        "kid": key["kid"],
                        "use": key["use"],
                        "n": key["n"],
                        "e": key["e"]
                    }
            if not rsa_key:
                return jsonify({"message": "Appropriate key not found"}), 401
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=ALGORITHMS,
                audience=API_AUDIENCE,
                issuer=f"https://{AUTH0_DOMAIN}/"
            )
        except Exception as e:
            return jsonify({"message": "Token verification failed", "error": str(e)}), 401

        # attach payload to flask.g for handlers
        g.current_user = payload
        return f(*args, **kwargs)
    return wrapper