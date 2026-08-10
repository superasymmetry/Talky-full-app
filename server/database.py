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

users_collection.create_index("userId", unique=True)

phoneme_video_cache.create_index("phoneme", unique=True)

lesson_attempts_collection.create_index(
    [("userId", 1), ("lessonId", 1), ("attemptNumber", 1)], unique=True
)

try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)
