from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from httpx import RequestError
from pydantic import BaseModel, ValidationError
from supabase import Client, ClientOptions, create_client
from supabase_auth.errors import AuthApiError, AuthError
import os
import re

# Always load backend/.env (cwd is not always the backend folder when using uvicorn).
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


def get_supabase(authorization: str | None = Header(None)) -> Client:
    credentials_error = HTTPException(
        status_code=401,
        detail="Missing, invalid, or expired bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    parts = authorization.split() if authorization else []
    if (
        len(parts) != 2
        or parts[0].lower() != "bearer"
        or re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", parts[1]) is None
    ):
        raise credentials_error

    token = parts[1]
    # Each request keeps the caller's token for RLS, without creating a login
    # session or trying to refresh an expired token with an empty refresh token.
    client = create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(
        headers={"Authorization": f"Bearer {token}"},
        auto_refresh_token=False,
        persist_session=False,
    ))
    try:
        user_response = client.auth.get_user(token)
    except AuthApiError as error:
        if error.status in (400, 401, 403, 422):
            raise credentials_error from error
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from error
    except (AuthError, RequestError, ValidationError) as error:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from error

    if user_response is None or user_response.user is None:
        raise credentials_error
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
        # A list response lets zero matches reach the not-found check below.
        response = (
            supabase_public.table("posts")
            .select("*")
            .eq("id", job_id)
            .eq("status", "Active")
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Job not found or not active")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching job details: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch job details")


@app.get("/posts")
def get_posts(supabase: Client = Depends(get_supabase)):
    try:
        # User is authenticated via get_supabase, RLS will filter to their posts
        response = supabase.table("posts").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/posts/{post_id}/status")
def update_post_status(
    post_id: str, status_update: StatusUpdate, supabase: Client = Depends(get_supabase)
):
    if status_update.status not in ["Draft", "Active", "Closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    try:
        response = (
            supabase.table("posts")
            .update({"status": status_update.status})
            .eq("id", post_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Post not found or you don't have permission")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
