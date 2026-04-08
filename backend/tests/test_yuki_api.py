"""
Backend API Tests for ERROR707 Studio - Yuki AI Assistant
Tests: Auth, Yuki endpoints, GitHub integration
"""
import pytest
import requests
import os
import json

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
ADMIN_USERNAME = "error707mty"
ADMIN_PASSWORD = "buentello0607"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_healthz_endpoint(self):
        """Test /api/healthz returns ok status"""
        response = requests.get(f"{BASE_URL}/api/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test successful login with admin credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["username"] == ADMIN_USERNAME
        assert data["isAdmin"] == True
        print(f"✅ Login successful for {ADMIN_USERNAME}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "wronguser", "password": "wrongpass"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        print("✅ Invalid credentials rejected correctly")
    
    def test_login_missing_fields(self):
        """Test login with missing fields"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME}
        )
        assert response.status_code == 400
        print("✅ Missing password rejected correctly")
    
    def test_auth_me_with_token(self):
        """Test /api/auth/me with valid token"""
        # First login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        token = login_response.json()["token"]
        
        # Then get user info
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == ADMIN_USERNAME
        assert data["isAdmin"] == True
        print("✅ Auth me endpoint works correctly")
    
    def test_auth_me_without_token(self):
        """Test /api/auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✅ Unauthorized access rejected correctly")


class TestYukiAccess:
    """Yuki access control tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_yuki_access_with_admin(self, admin_token):
        """Test Yuki access with admin user (error707mty)"""
        response = requests.get(
            f"{BASE_URL}/api/yuki/access",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("access") == True
        print("✅ Admin user has Yuki access")
    
    def test_yuki_access_without_token(self):
        """Test Yuki access without token"""
        response = requests.get(f"{BASE_URL}/api/yuki/access")
        assert response.status_code == 401
        print("✅ Yuki access denied without token")


class TestYukiConfig:
    """Yuki AI configuration tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_get_yuki_config(self, admin_token):
        """Test getting Yuki AI configuration"""
        response = requests.get(
            f"{BASE_URL}/api/yuki/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert "activeProviderId" in data
        assert isinstance(data["providers"], list)
        print(f"✅ Yuki config retrieved - {len(data['providers'])} providers")
    
    def test_yuki_config_has_deepseek(self, admin_token):
        """Test that DeepSeek provider is configured"""
        response = requests.get(
            f"{BASE_URL}/api/yuki/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        providers = data.get("providers", [])
        deepseek_provider = next((p for p in providers if "deepseek" in p.get("id", "").lower()), None)
        assert deepseek_provider is not None
        assert deepseek_provider.get("hasKey") == True
        print("✅ DeepSeek provider configured with API key")


class TestYukiUploads:
    """Yuki file upload tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_list_uploads(self, admin_token):
        """Test listing uploaded files"""
        response = requests.get(
            f"{BASE_URL}/api/yuki/uploads",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)
        print(f"✅ Uploads list retrieved - {len(data['files'])} files")
    
    def test_upload_file(self, admin_token):
        """Test uploading a file"""
        # Create a test file
        files = {"file": ("test_upload.txt", b"Test content for upload", "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/yuki/upload",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "filename" in data
        assert "path" in data
        print(f"✅ File uploaded successfully: {data.get('filename')}")


class TestYukiChat:
    """Yuki chat/AI interaction tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_chat_endpoint_exists(self, admin_token):
        """Test that chat endpoint accepts requests"""
        response = requests.post(
            f"{BASE_URL}/api/yuki/chat",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            json={"messages": [{"role": "user", "content": "Hola"}]},
            stream=True,
            timeout=30
        )
        assert response.status_code == 200
        # Check that we get SSE response
        assert "text/event-stream" in response.headers.get("Content-Type", "")
        print("✅ Chat endpoint responds with SSE stream")
    
    def test_chat_with_tool_calling(self, admin_token):
        """Test chat with tool calling (list_files)"""
        response = requests.post(
            f"{BASE_URL}/api/yuki/chat",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            json={"messages": [{"role": "user", "content": "Lista los archivos en artifacts/dtf-pliego/src/pages"}]},
            stream=True,
            timeout=60
        )
        assert response.status_code == 200
        
        # Read the SSE response
        content = response.text
        assert "data:" in content
        
        # Check for tool execution
        has_tool_result = "tool_result" in content or "list_files" in content
        print(f"✅ Chat with tool calling works - tool executed: {has_tool_result}")
    
    def test_chat_missing_messages(self, admin_token):
        """Test chat with missing messages"""
        response = requests.post(
            f"{BASE_URL}/api/yuki/chat",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            json={}
        )
        assert response.status_code == 400
        print("✅ Chat rejects requests without messages")


class TestGitHubIntegration:
    """GitHub integration tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_get_github_config(self, admin_token):
        """Test getting GitHub configuration"""
        response = requests.get(
            f"{BASE_URL}/api/github/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Config should have configured status
        assert "configured" in data or "repoUrl" in data
        print(f"✅ GitHub config retrieved - configured: {data.get('configured', data.get('tokenSet', False))}")
    
    def test_get_github_status(self, admin_token):
        """Test getting git status"""
        response = requests.get(
            f"{BASE_URL}/api/github/status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "branch" in data
        assert "hasChanges" in data
        print(f"✅ Git status retrieved - branch: {data.get('branch')}, changes: {data.get('changesCount', 0)}")
    
    def test_github_access_without_token(self):
        """Test GitHub endpoints without token"""
        response = requests.get(f"{BASE_URL}/api/github/config")
        assert response.status_code == 401
        print("✅ GitHub access denied without token")


class TestYukiTools:
    """Test Yuki autonomous tools via chat"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_read_file_tool(self, admin_token):
        """Test read_file tool via chat"""
        response = requests.post(
            f"{BASE_URL}/api/yuki/chat",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            json={"messages": [{"role": "user", "content": "Lee el archivo artifacts/api-server/package.json"}]},
            stream=True,
            timeout=60
        )
        assert response.status_code == 200
        content = response.text
        # Should contain tool result with file content
        assert "data:" in content
        print("✅ Read file tool works via chat")
    
    def test_get_app_stats_tool(self, admin_token):
        """Test get_app_stats tool via chat"""
        response = requests.post(
            f"{BASE_URL}/api/yuki/chat",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            json={"messages": [{"role": "user", "content": "Dame las estadísticas de la app"}]},
            stream=True,
            timeout=60
        )
        assert response.status_code == 200
        content = response.text
        assert "data:" in content
        print("✅ Get app stats tool works via chat")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
