from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client
import os

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")

app = FastAPI(title="Volunteer Discovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://192.168.86.1:3000",
        "http://192.168.86.1:3001"
    ],
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

# Server-side client for public active-job listings (credentials from .env)
supabase_public: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase(authorization: str = Header(None)) -> Client:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    token = authorization.replace("Bearer ", "")
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.auth.set_session(access_token=token, refresh_token="")
    return client


class StatusUpdate(BaseModel):
    status: str


@app.get("/api/jobs")
def get_active_jobs():
    try:
        response = (
            supabase_public.table("posts")
            .select("*")
            .eq("status", "Active")
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch active jobs.")


@app.get("/api/jobs/{job_id}")
def get_job_by_id(job_id: str):
    try:
        response = (
            supabase_public.table("posts")
            .select("*")
            .eq("id", job_id)
            .eq("status", "Active")
            .single()
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Job not found or not active")
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching job details: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch job details")


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
