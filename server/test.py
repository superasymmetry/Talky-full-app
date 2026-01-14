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

# Send a ping to confirm a successful connection
try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

# Debug: Check collection name and database
print(f"\nDatabase: {db.name}")
print(f"Collection: {users_collection.name}")

# Debug: Count total documents
count = users_collection.count_documents({})
print(f"\nTotal documents in collection: {count}")

# Debug: List all documents to see what's there
print("\nAll documents in collection:")
for doc in users_collection.find().limit(5):
    print(f"  _id: {doc.get('_id')}, userId: {repr(doc.get('userId'))}")

# Try to find the demo user
print("\nSearching for userId='demo':")
user = users_collection.find_one({"userId": "demo"})

if user:
    print(f"Found user: {user}")
else:
    print("User with userId='demo' NOT FOUND")
    
    # Check if there's a similar userId with whitespace or case issues
    print("\nChecking for case/whitespace variants:")
    for variant in ["demo", "Demo", " demo", "demo ", " demo "]:
        test = users_collection.find_one({"userId": variant})
        if test:
            print(f"  Found with userId={repr(variant)}")