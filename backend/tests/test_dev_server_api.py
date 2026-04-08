"""
Test suite for Yuki IDE Dev Server API endpoints
Tests: /api/github/start-dev, /api/github/stop-dev, /api/github/dev-status
"""
import pytest
import requests
import time
import os

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:3000').rstrip('/')

# Test credentials
TEST_USERNAME = "error707mty"
TEST_PASSWORD = "buentello0607"


class TestDevServerAPI:
    """Test dev server start/stop/status endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_dev_status_initial(self):
        """Test GET /api/github/dev-status - Check initial status"""
        response = self.session.get(f"{BASE_URL}/api/github/dev-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "running" in data, "Response should contain 'running' field"
        assert "port" in data, "Response should contain 'port' field"
        assert data["port"] == 3001, "Dev server should use port 3001"
        
        print(f"✅ Dev status check passed - Running: {data['running']}")
        return data["running"]
    
    def test_02_stop_dev_server_if_running(self):
        """Test POST /api/github/stop-dev - Stop any running dev server"""
        response = self.session.post(f"{BASE_URL}/api/github/stop-dev")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True or "message" in data, "Should return success or message"
        
        print(f"✅ Stop dev server passed - {data}")
    
    def test_03_start_dev_server(self):
        """Test POST /api/github/start-dev - Start dev server for cloned repo"""
        response = self.session.post(
            f"{BASE_URL}/api/github/start-dev",
            json={}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Should return success=True, got: {data}"
        assert "previewUrl" in data, "Response should contain previewUrl"
        assert data["previewUrl"] == "http://localhost:3001", f"Preview URL should be localhost:3001, got: {data['previewUrl']}"
        
        print(f"✅ Start dev server passed - Preview URL: {data['previewUrl']}")
    
    def test_04_dev_status_after_start(self):
        """Test GET /api/github/dev-status - Verify server is running after start"""
        # Wait for server to fully start
        time.sleep(5)
        
        response = self.session.get(f"{BASE_URL}/api/github/dev-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("running") == True, f"Dev server should be running, got: {data}"
        assert data.get("previewUrl") == "http://localhost:3001", f"Preview URL should be set when running"
        
        print(f"✅ Dev status after start passed - Running: {data['running']}")
    
    def test_05_verify_port_3001_responding(self):
        """Test that port 3001 is actually responding"""
        # Wait a bit more for Vite to fully start
        time.sleep(3)
        
        try:
            response = requests.get("http://localhost:3001", timeout=10)
            # Vite dev server should respond with HTML
            assert response.status_code == 200, f"Port 3001 should respond with 200, got {response.status_code}"
            print(f"✅ Port 3001 is responding - Status: {response.status_code}")
        except requests.exceptions.ConnectionError:
            pytest.fail("Port 3001 is not responding - dev server may not have started properly")
        except requests.exceptions.Timeout:
            pytest.fail("Port 3001 timed out - dev server may be slow to start")
    
    def test_06_stop_dev_server(self):
        """Test POST /api/github/stop-dev - Stop the running dev server"""
        response = self.session.post(f"{BASE_URL}/api/github/stop-dev")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Should return success=True, got: {data}"
        
        print(f"✅ Stop dev server passed - {data}")
    
    def test_07_dev_status_after_stop(self):
        """Test GET /api/github/dev-status - Verify server is stopped"""
        time.sleep(2)
        
        response = self.session.get(f"{BASE_URL}/api/github/dev-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("running") == False, f"Dev server should be stopped, got: {data}"
        assert data.get("previewUrl") is None, f"Preview URL should be null when stopped"
        
        print(f"✅ Dev status after stop passed - Running: {data['running']}")
    
    def test_08_verify_port_3001_not_responding(self):
        """Test that port 3001 is no longer responding after stop"""
        time.sleep(2)
        
        try:
            response = requests.get("http://localhost:3001", timeout=3)
            # If we get here, the server is still running
            pytest.fail(f"Port 3001 should not be responding after stop, but got status {response.status_code}")
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # This is expected - server should be stopped
            print("✅ Port 3001 is not responding (as expected after stop)")


class TestClonedRepoEndpoints:
    """Test cloned repo related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_cloned_repo_status(self):
        """Test GET /api/github/cloned-repo - Check cloned repo status"""
        response = self.session.get(f"{BASE_URL}/api/github/cloned-repo")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cloned" in data, "Response should contain 'cloned' field"
        assert data["cloned"] == True, f"Repo should be cloned, got: {data}"
        assert data.get("repoName") == "chidolol", f"Repo name should be 'chidolol', got: {data.get('repoName')}"
        assert "/app/yuki-repos/chidolol" in data.get("clonePath", ""), f"Clone path should contain /app/yuki-repos/chidolol"
        
        print(f"✅ Cloned repo status passed - {data}")
    
    def test_02_github_config(self):
        """Test GET /api/github/config - Check GitHub config"""
        response = self.session.get(f"{BASE_URL}/api/github/config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("configured") == True or data.get("repoUrl"), "GitHub should be configured"
        assert "tokenSet" in data or "tokenPreview" in data, "Should indicate if token is set"
        
        print(f"✅ GitHub config check passed - {data}")


class TestAccessControl:
    """Test access control for dev server endpoints"""
    
    def test_01_dev_status_without_auth(self):
        """Test GET /api/github/dev-status without authentication"""
        response = requests.get(f"{BASE_URL}/api/github/dev-status")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ Access control: dev-status requires auth")
    
    def test_02_start_dev_without_auth(self):
        """Test POST /api/github/start-dev without authentication"""
        response = requests.post(f"{BASE_URL}/api/github/start-dev", json={})
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ Access control: start-dev requires auth")
    
    def test_03_stop_dev_without_auth(self):
        """Test POST /api/github/stop-dev without authentication"""
        response = requests.post(f"{BASE_URL}/api/github/stop-dev")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ Access control: stop-dev requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
