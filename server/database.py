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
lesson_attempts_collection = db["lesson_attempts"]
teacher_notes_collection = db["teacher_notes"]

users_collection.create_index("userId", unique=True)

# Drop the legacy single-field unique index if a pre-existing deployment
# still has it - find_video.py upserts on the compound (phoneme, word_key)
# key, so a lingering "phoneme"-only unique index raises DuplicateKeyError
# for every word set beyond a phoneme's first, permanently breaking
# intro-video caching for that phoneme.
try:
    existing_indexes = phoneme_video_cache.index_information()
    legacy = existing_indexes.get("phoneme_1")
    if legacy and legacy.get("unique") and legacy.get("key") == [("phoneme", 1)]:
        phoneme_video_cache.drop_index("phoneme_1")
except Exception as e:
    print(f"WARNING: could not drop legacy phoneme_video_cache index: {e}")

phoneme_video_cache.create_index([("phoneme", 1), ("word_key", 1)], unique=True)

lesson_attempts_collection.create_index(
    [("userId", 1), ("lessonId", 1), ("attemptNumber", 1)], unique=True
)
lesson_attempts_collection.create_index([("userId", 1), ("createdAt", -1)])

teacher_notes_collection.create_index([("studentId", 1), ("createdAt", -1)])

try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)
