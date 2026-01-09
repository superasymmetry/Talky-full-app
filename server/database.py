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

def set_lesson_data(user_id, lesson_id, words, phoneme, score):
    try:
        update = {
            f"lessons.{lesson_id}": {
                "words": words,
                "phoneme": phoneme,
                "score": score
            }
        }
        users_collection.update_one({"userId": user_id}, {"$set": update}, upsert=True)
    except Exception as e:
        print(f"Failed to set lesson data for user {user_id}, lesson {lesson_id}: {e}")
        raise Exception(f"Internal error occured")