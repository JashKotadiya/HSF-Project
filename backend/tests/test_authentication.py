"""Exercise the real authentication dependency and SDK with mocked HTTP only."""

import base64
import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from supabase import ClientOptions, create_client


def token(subject, expires=4102444800):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    # Synthetic tokens are accepted or rejected only by the local Auth fixture.
    return ".".join((encode({"alg": "HS256", "typ": "JWT"}), encode({
        "sub": subject, "exp": expires, "aud": "authenticated", "role": "authenticated",
    }), "dGVzdC1zaWduYXR1cmU"))


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.clients = []
        self.user_id = "00000000-0000-0000-0000-000000000001"
        self.valid_token = token(self.user_id)
        self.valid_tokens = {self.valid_token: self.user_id}
        self.auth_status = None
        self.auth_timeout = False
        self.malformed_auth_response = False
        self.database_error = False
        self.transport = httpx.Client(transport=httpx.MockTransport(self.respond))
        self.addCleanup(self.transport.close)

        def local_client(url, key, options=None):
            options = options or ClientOptions()
            options.httpx_client = self.transport
            client = create_client(url, key, options)
            self.clients.append(client)
            return client

        spec = importlib.util.spec_from_file_location(
            "backend_auth_under_test", Path(__file__).resolve().parents[1] / "main.py"
        )
        self.backend = importlib.util.module_from_spec(spec)
        with (
            patch.dict(os.environ, {"SUPABASE_URL": "https://database.example.test", "SUPABASE_KEY": "test-key"}),
            patch("dotenv.load_dotenv"),
            patch("supabase.create_client", side_effect=local_client),
        ):
            spec.loader.exec_module(self.backend)
        self.client = TestClient(self.backend.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def respond(self, request):
        self.requests.append(request)
        bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
        if request.url.path == "/auth/v1/user":
            self.assertEqual(request.method, "GET")
            if self.auth_timeout:
                raise httpx.ReadTimeout("Auth unavailable", request=request)
            if self.malformed_auth_response:
                return httpx.Response(200, json={"unexpected": "response"})
            status = self.auth_status or (200 if bearer in self.valid_tokens else 401)
            if status != 200:
                return httpx.Response(status, json={"code": "bad_jwt", "message": "Private upstream diagnostics"})
            return httpx.Response(200, json={
                "id": self.valid_tokens[bearer], "aud": "authenticated", "role": "authenticated",
                "email": "test@example.test", "app_metadata": {}, "user_metadata": {},
                "created_at": "2026-01-01T00:00:00Z",
            })
        self.assertEqual(request.url.path, "/rest/v1/posts")
        if self.database_error:
            return httpx.Response(500, json={"code": "XX000", "message": "Database unavailable"})
        self.assertIn(bearer, self.valid_tokens, "Database requests must use the verified caller's token")
        row = {"id": "test-post", "user_id": self.valid_tokens[bearer], "status": "Active"}
        if request.method == "PATCH":
            row.update(json.loads(request.content))
        return httpx.Response(200, json=[row])

    def request(self, method, authorization=None):
        return self.client.request(
            method, "/posts" if method == "GET" else "/posts/test-post/status",
            headers={} if authorization is None else {"Authorization": authorization},
            json=None if method == "GET" else {"status": "Closed"},
        )

    def assert_unauthorized(self, response):
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.headers.get("www-authenticate"), "Bearer")
        self.assertNotIn("Private upstream diagnostics", response.text)
        self.assertFalse(any(r.url.path.startswith("/rest/") for r in self.requests))

    def test_missing_and_malformed_headers_return_401_without_network(self):
        for method in ("GET", "PATCH"):
            for header in (None, "", "Bearer", "Bearer ", "Basic credentials", "Token credentials", "Bearer one two"):
                with self.subTest(method=method, header=header):
                    self.requests.clear()
                    self.assert_unauthorized(self.request(method, header))
                    self.assertEqual(self.requests, [])

    def test_malformed_expired_and_rejected_tokens_return_401(self):
        for method in ("GET", "PATCH"):
            for credential in ("not-a-jwt", "a.b.c", token(self.user_id, expires=1), token("revoked-user")):
                with self.subTest(method=method, credential=credential):
                    self.requests.clear()
                    self.assert_unauthorized(self.request(method, "Bearer " + credential))

    def test_invalid_bearer_characters_are_rejected_before_creating_sdk_headers(self):
        for method in ("GET", "PATCH"):
            for header in (b"Bearer \xff", b"Bearer abc\x00def", 'Bearer "quoted-token"'):
                with self.subTest(method=method, header=header):
                    self.requests.clear()
                    self.assert_unauthorized(self.request(method, header))
                    self.assertEqual(self.requests, [])

    def test_auth_rejections_are_not_internal_errors(self):
        for status in (400, 401, 403, 422):
            for method in ("GET", "PATCH"):
                with self.subTest(status=status, method=method):
                    self.auth_status = status
                    self.requests.clear()
                    self.assert_unauthorized(self.request(method, "Bearer " + self.valid_token))

    def test_valid_token_reaches_both_endpoints_with_user_authorization(self):
        for method in ("GET", "PATCH"):
            with self.subTest(method=method):
                self.requests.clear()
                response = self.request(method, "Bearer " + self.valid_token)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([r.url.path for r in self.requests], ["/auth/v1/user", "/rest/v1/posts"])
                self.assertEqual(self.requests[-1].headers["authorization"], "Bearer " + self.valid_token)
                row = response.json()[0] if method == "GET" else response.json()
                self.assertEqual(row["user_id"], self.user_id)
                self.assertEqual(row["status"], "Active" if method == "GET" else "Closed")

    def test_bearer_scheme_is_case_insensitive(self):
        response = self.request("GET", "bEaReR " + self.valid_token)
        self.assertEqual(response.status_code, 200, response.text)

    def test_requests_use_separate_clients_without_persisted_or_refresh_sessions(self):
        second_id = "00000000-0000-0000-0000-000000000002"
        second_token = token(second_id)
        self.valid_tokens[second_token] = second_id
        first = self.request("GET", "Bearer " + self.valid_token)
        second = self.request("GET", "Bearer " + second_token)
        self.assertEqual(first.json()[0]["user_id"], self.user_id)
        self.assertEqual(second.json()[0]["user_id"], second_id)
        self.assertIsNot(self.clients[-1], self.clients[-2])
        for client in self.clients[-2:]:
            self.assertFalse(client.options.auto_refresh_token)
            self.assertFalse(client.options.persist_session)
            self.assertIsNone(client.auth.get_session())
        self.assertEqual(self.clients[0].options.headers["Authorization"], "Bearer test-key")

    def test_auth_service_failures_return_503_without_database_access(self):
        for status in (429, 500, 502, 503, 504):
            for method in ("GET", "PATCH"):
                with self.subTest(status=status, method=method):
                    self.auth_status = status
                    self.requests.clear()
                    response = self.request(method, "Bearer " + self.valid_token)
                    self.assertEqual(response.status_code, 503, response.text)
                    self.assertNotIn("www-authenticate", response.headers)
                    self.assertNotIn("Private upstream diagnostics", response.text)
                    self.assertFalse(any(r.url.path.startswith("/rest/") for r in self.requests))

    def test_auth_timeouts_return_503(self):
        self.auth_timeout = True
        for method in ("GET", "PATCH"):
            with self.subTest(method=method):
                self.assertEqual(self.request(method, "Bearer " + self.valid_token).status_code, 503)
        self.assertTrue(all(r.url.path == "/auth/v1/user" for r in self.requests))

    def test_invalid_auth_service_response_is_not_reported_as_bad_credentials(self):
        self.malformed_auth_response = True
        response = self.request("GET", "Bearer " + self.valid_token)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("www-authenticate", response.headers)

    def test_database_failure_remains_500_after_successful_authentication(self):
        self.database_error = True
        for method in ("GET", "PATCH"):
            with self.subTest(method=method):
                self.assertEqual(self.request(method, "Bearer " + self.valid_token).status_code, 500)


if __name__ == "__main__":
    unittest.main()
