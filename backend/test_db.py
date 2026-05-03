import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("c:\\Users\\Jash_\\OneDrive\\Desktop\\BUILD UMass - Build volunteer discovery platform\\backend\\.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)
response = supabase.table("posts").select("*").limit(1).execute()
if response.data:
    print(response.data[0].keys())
else:
    print("No data")
