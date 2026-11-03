from google.oauth2 import service_account
from google.cloud import storage
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

KEY_PATH = 'service-account-key.json'

def verify():
    print("🕵️ Starting Google Cloud Verification...")
    
    if not os.path.exists(KEY_PATH):
        print(f"❌ File not found: {KEY_PATH}")
        return

    try:
        print(f"🔑 Loading key from {KEY_PATH}...")
        creds = service_account.Credentials.from_service_account_file(KEY_PATH)
        print(f"✅ Credentials loaded for Project ID: {creds.project_id}")
        print(f"📧 Service Account Email: {creds.service_account_email}")
        
        print("\n☁️ Attempting to connect to Google Cloud Storage...")
        client = storage.Client(credentials=creds)
        buckets = list(client.list_buckets(max_results=5))
        print("✅ Connection Successful! Authenticated with Google Cloud.")
        print(f"📦 Buckets found: {[b.name for b in buckets]}")
        
    except Exception as e:
        print("\n❌ Authentication Failed.")
        print(f"Error details: {e}")

if __name__ == "__main__":
    verify()