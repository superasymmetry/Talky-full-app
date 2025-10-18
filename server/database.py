from dotenv import load_dotenv
import os
from pymongo import MongoClient
import certifi

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client["talky"]
users_collection = db["users"]

# Ensure a unique index on userId so duplicate inserts are prevented at DB level
try:
    users_collection.create_index("userId", unique=True)
    print("Ensured unique index on users.userId")
except Exception as e:
    print("Failed to create unique index on users.userId:", e)

print("Connected to MongoDB successfully!")