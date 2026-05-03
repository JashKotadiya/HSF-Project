from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Volunteer Discovery API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Supabase credentials are not set in the environment.")

supabase: Client = create_client(url, key)

@app.get("/api/jobs")
def get_active_jobs():
    try:
        # Fetch only 'Active' posts
        response = supabase.table("posts").select("*").eq("status", "Active").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch active jobs.")

@app.get("/api/jobs/{job_id}")
def get_job_by_id(job_id: str):
    try:
        response = supabase.table("posts").select("*").eq("id", job_id).eq("status", "Active").single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Job not found or not active")
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching job details: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch job details")
