from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL and SUPABASE_KEY must be set in .env")

# To bypass RLS via server-side logic when needed we could use the service_role key, 
# but here we'll instantiate clients dynamically with the user's token for RLS.
supabase_anon: Client = create_client(SUPABASE_URL or "", SUPABASE_KEY or "")

def get_supabase(authorization: str = Header(None)) -> Client:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    token = authorization.replace("Bearer ", "")
    # Create a new client instance for this request using the anon key
    client = create_client(SUPABASE_URL or "", SUPABASE_KEY or "")
    # Set the auth token so RLS policies are applied correctly
    client.auth.set_session(access_token=token, refresh_token="")
    return client

class StatusUpdate(BaseModel):
    status: str

@app.get("/posts")
def get_posts(supabase: Client = Depends(get_supabase)):
    try:
        # User is authenticated via get_supabase, RLS will filter to their posts
        # We don't need to specify user_id in the query because RLS does it
        response = supabase.table("posts").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/posts/{post_id}/status")
def update_post_status(post_id: str, status_update: StatusUpdate, supabase: Client = Depends(get_supabase)):
    if status_update.status not in ["Draft", "Active", "Closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    try:
        response = supabase.table("posts").update({"status": status_update.status}).eq("id", post_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Post not found or you don't have permission")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
