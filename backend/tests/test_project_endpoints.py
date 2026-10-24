"""Run from the repository root: python -m unittest discover -s backend/tests -v."""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from postgrest import SyncPostgrestClient


class ProjectEndpointTests(unittest.TestCase):
    def setUp(self):
        self.post = {"id": "existing-post", "title": "Example project", "status": "Active"}
        self.rows = [self.post]
        self.can_update = True
        self.database_error = False
        self.requests = []
        self.transport_client = httpx.Client(transport=httpx.MockTransport(self.respond))
        self.addCleanup(self.transport_client.close)
        self.database = SyncPostgrestClient(
            "https://database.example.test/rest/v1", http_client=self.transport_client
        )

        # Exercise the real PostgREST client without credentials or external requests.
        spec = importlib.util.spec_from_file_location(
            "backend_under_test", Path(__file__).resolve().parents[1] / "main.py"
        )
        self.backend = importlib.util.module_from_spec(spec)
        with (
            patch.dict(os.environ, {"SUPABASE_URL": "https://database.example.test", "SUPABASE_KEY": "test-key"}),
            patch("dotenv.load_dotenv"),
            patch("supabase.create_client", return_value=self.database),
        ):
            spec.loader.exec_module(self.backend)
        self.backend.app.dependency_overrides[self.backend.get_supabase] = lambda: self.database
        self.client = TestClient(self.backend.app)
        self.addCleanup(self.client.close)

    def respond(self, request):
        self.requests.append(request)
        self.assertEqual(request.url.path, "/rest/v1/posts")
        if self.database_error:
            return httpx.Response(500, json={
                "code": "XX000", "message": "Simulated database failure", "details": None, "hint": None,
            })

        # Model PostgREST filtering, an RLS-hidden update, and singular responses.
        rows = self.rows
        for field in ("id", "status"):
            value = request.url.params.get(field)
            if value is not None:
                self.assertTrue(value.startswith("eq."))
                rows = [row for row in rows if row[field] == value[3:]]
        if request.method == "PATCH":
            rows = rows if self.can_update else []
            for row in rows:
                row.update(json.loads(request.content))
        else:
            self.assertEqual(request.method, "GET")

        if request.headers.get("accept") == "application/vnd.pgrst.object+json":
            if len(rows) != 1:
                return httpx.Response(406, json={
                    "code": "PGRST116", "message": "Cannot coerce the result to a single JSON object",
                    "details": f"The result contains {len(rows)} rows", "hint": None,
                })
            return httpx.Response(200, json=rows[0])
        return httpx.Response(200, json=rows)

    def test_get_missing_job_returns_404(self):
        response = self.client.get("/api/jobs/missing-post")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Job not found or not active"})

    def test_get_inactive_job_returns_404(self):
        self.post["status"] = "Closed"
        response = self.client.get("/api/jobs/existing-post")
        self.assertEqual(response.status_code, 404)

    def test_get_active_job_returns_object(self):
        response = self.client.get("/api/jobs/existing-post")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.post)

    def test_get_database_error_remains_500(self):
        self.database_error = True
        response = self.client.get("/api/jobs/existing-post")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Failed to fetch job details"})

    def test_patch_missing_post_returns_404(self):
        response = self.client.patch("/posts/missing-post/status", json={"status": "Active"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Post not found or you don't have permission"})

    def test_patch_inaccessible_post_returns_404(self):
        self.can_update = False
        response = self.client.patch("/posts/existing-post/status", json={"status": "Closed"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.post["status"], "Active")

    def test_patch_accessible_post_updates_and_returns_object(self):
        response = self.client.patch("/posts/existing-post/status", json={"status": "Closed"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": "existing-post", "title": "Example project", "status": "Closed"})

    def test_patch_invalid_status_returns_400_without_database_request(self):
        response = self.client.patch("/posts/existing-post/status", json={"status": "invalid"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.requests, [])

    def test_patch_database_error_remains_500(self):
        self.database_error = True
        response = self.client.patch("/posts/existing-post/status", json={"status": "Closed"})
        self.assertEqual(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
