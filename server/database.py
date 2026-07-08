import os
import certifi
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError(
        "Missing MONGO_URI environment variable. "
        "Set MONGO_URI in server/.env or your system environment."
    )

# Send a ping to confirm a successful connection
try:
    print("[DATABASE] Attempting to connect to MongoDB...")
    client = MongoClient(
        MONGO_URI,
        server_api=ServerApi('1'),
        tlsCAFile=certifi.where()
    )
    db = client[os.getenv("DB_NAME", "talky")]
    users_collection = db["users"]

    # Create a unique index on userId to prevent full collection scans
    users_collection.create_index("userId", unique=True)

    # Send a ping to confirm a successful connection
    print("[DATABASE] Sending ping to MongoDB...")
    ping_result = client.admin.command('ping')
    print(f"[DATABASE] ✓ PING SUCCESSFUL - Response: {ping_result}")
    print("[DATABASE] ✓ Pinged your deployment. You successfully connected to MongoDB!")
except Exception as exc:
    print(f"[DATABASE] ✗ PING FAILED - Error: {exc}")
    raise RuntimeError(
        "Failed to connect to MongoDB. Check MONGO_URI in server/.env "
        "and verify the Atlas cluster name is correct."
    ) from exc
