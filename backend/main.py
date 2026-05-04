from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client
import os

# Always load backend/.env (cwd is not always the backend folder when using uvicorn).
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
).strip()
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
).strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        f"Missing SUPABASE_URL and SUPABASE_KEY (or NEXT_PUBLIC_* equivalents). "
        f"Set them in {_BACKEND_DIR / '.env'} — see .env.example."
    )

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
