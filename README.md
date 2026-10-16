# HSF Project

HSF Project is a volunteer opportunity platform for the Human Service Forum. It connects nonprofit organizations with volunteers who can contribute technical skills to community projects. Organizations can publish their needs, review applications, and manage project listings. Volunteers can discover opportunities, apply with a resume, and track their application status.

## Features

- Email and password registration and login with volunteer and nonprofit roles.
- Project discovery with keyword search and filters for causes and technical skills.
- Nonprofit dashboards for creating, editing, and managing Draft, Active, and Closed listings.
- Volunteer applications with short answers and resume uploads.
- Applicant review tools for nonprofits to view applications, download resumes, and approve or reject applicants.
- A volunteer dashboard for tracking submitted applications.

## Technology

| Component | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn |
| Authentication, database, and file storage | Supabase |

The frontend currently connects directly to Supabase for authentication, project data, applications, and resume uploads. The FastAPI backend also provides endpoints for browsing active projects and managing project posts.

## Project structure

```text
HSF-Project/
  frontend/    Next.js application
  backend/     FastAPI application
  supabase/    Database and storage setup scripts
```

## Getting started

### 1. Install prerequisites

- Git
- Node.js 20.9 or later and npm, as required by [Next.js](https://nextjs.org/docs/app/getting-started/installation#system-requirements)
- Python 3 with pip and the venv module
- Access to a configured development Supabase project

### 2. Clone the repository

```bash
git clone https://github.com/JashKotadiya/HSF-Project.git
cd HSF-Project
```

If you already have a local checkout, open its `HSF-Project` folder instead. The commands below start from this repository root unless stated otherwise.

### 3. Configure Supabase

Ask a project maintainer for access to the development Supabase project and its configuration. The application expects existing `profiles`, `posts`, and `applications` tables.

The scripts in `supabase/` extend that existing schema:

- [profiles_signup.sql](supabase/profiles_signup.sql) configures profile access policies and creates profiles when users sign up.
- [applications.sql](supabase/applications.sql) configures application fields, access policies, and the private `resumes` storage bucket.

These scripts assume the base tables already exist. For a new Supabase project, obtain the base schema from a maintainer before applying these scripts in the SQL Editor.

Enable email and password authentication and configure authentication redirects for your local frontend URL, normally `http://localhost:3000`. If email confirmation is enabled, confirm your email before signing in.

### 4. Add environment variables

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Create `backend/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY
```

Use the same development Supabase project for both files. Use the project's public anon key for this configuration. A service role or secret key must never be placed in frontend environment variables because those variables are exposed to the browser. See the [Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

Both environment files are excluded from Git. Restart the relevant server after changing its environment variables.

### 5. Install frontend dependencies

```bash
cd frontend
npm ci
cd ..
```

### 6. Set up the backend environment

Create a virtual environment and install the backend's runtime dependencies.

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn python-dotenv supabase
cd ..
```

macOS or Linux:

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install fastapi uvicorn python-dotenv supabase
cd ..
```

These commands use the virtual environment's Python directly, so activating it is optional. Dependencies are listed in the commands because a backend requirements file is not currently tracked in the repository.

## Running locally

Open two terminals in the repository root, one for each server.

### Terminal 1: Frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To use port 3001 instead:

```bash
npm run dev -- --port 3001
```

### Terminal 2: Backend

Windows PowerShell:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

macOS or Linux:

```bash
cd backend
./.venv/bin/python -m uvicorn main:app --reload --port 8000
```

The backend runs at `http://localhost:8000`. Open [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation. The backend has no route at `/`, so use `/docs` to check that it is running.

Keep both terminals open while developing. Press `Ctrl+C` in either terminal to stop that server. The `--reload` option restarts the backend when its Python files change and is intended for development. See the [FastAPI server documentation](https://fastapi.tiangolo.com/deployment/manually/).

## Frontend commands

Run these commands from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build after running `npm run build` |
| `npm run lint` | Run the configured ESLint check |

## Common setup issues

- **Missing Supabase configuration:** Check that `backend/.env` contains `SUPABASE_URL` and `SUPABASE_KEY`, then restart the backend.
- **Missing Python package:** Run the backend dependency installation command with the same virtual environment Python used to start Uvicorn.
- **Database table, column, or storage errors:** Confirm that the development Supabase project has the base schema and the required setup scripts applied.
- **PowerShell blocks npm:** Use `npm.cmd` in place of `npm`, for example `npm.cmd run dev`.
- **Port 3000 is occupied:** Start the frontend on port 3001 and use that URL in the browser and your Supabase authentication redirect configuration.
