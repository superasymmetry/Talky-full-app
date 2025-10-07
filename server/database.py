from dotenv import load_dotenv
import os
from pymongo import MongoClient
import certifi

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client["talky"]
users_collection = db["users"]

print("✅ Connected to MongoDB successfully!")