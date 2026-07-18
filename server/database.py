import os
import certifi
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
db = client["talky"]
users_collection = db["users"]
phoneme_video_cache = db["phoneme_video_cache"]

# Create a unique index on userId to prevent full collection scans
users_collection.create_index("userId", unique=True)

# One document per phoneme: { phoneme, video_id, query, updated_at }.
# This is what lets find_video.py avoid re-scraping YouTube on every lesson load.
phoneme_video_cache.create_index("phoneme", unique=True)

# Send a ping to confirm a successful connection
try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)