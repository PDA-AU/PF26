import requests
import sys
import json
from datetime import datetime

class PersofestAPITester:
    def __init__(self, base_url="https://persofest.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.participant_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'Unknown error')}"
                except:
                    details += f", Response: {response.text[:100]}"

            self.log_test(name, success, details)
            return success, response.json() if success and response.content else {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        self.run_test("Root API endpoint", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health check endpoint", "GET", "health", 200)

    def test_public_endpoints(self):
        """Test public endpoints that don't require auth"""
        print("\n🔍 Testing Public Endpoints...")
        
        # Test registration status
        self.run_test("Registration status", "GET", "registration-status", 200)
        
        # Test public rounds
        self.run_test("Public rounds", "GET", "rounds/public", 200)
        
        # Test top referrers
        self.run_test("Top referrers", "GET", "top-referrers", 200)

    def test_admin_login(self):
        """Test admin login"""
        print("\n🔍 Testing Admin Authentication...")
        
        admin_data = {
            "register_number": "0000000000",
            "password": "admin123"
        }
        
        success, response = self.run_test("Admin login", "POST", "auth/login", 200, admin_data)
        
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_participant_registration(self):
        """Test participant registration"""
        print("\n🔍 Testing Participant Registration...")
        
        # Generate unique test data
        timestamp = datetime.now().strftime("%H%M%S")
        test_data = {
            "name": f"Test User {timestamp}",
            "register_number": f"123456{timestamp[:4]}",
            "email": f"test{timestamp}@example.com",
            "phone": f"98765{timestamp[:5]}",
            "password": "testpass123",
            "gender": "Male",
            "department": "Computer Technology",
            "year_of_study": "Second Year",
            "referral_code": None
        }
        
        success, response = self.run_test("Participant registration", "POST", "auth/register", 200, test_data)
        
        if success and 'access_token' in response:
            self.participant_token = response['access_token']
            print(f"   Participant token obtained: {self.participant_token[:20]}...")
            return True
        return False

    def test_participant_login(self):
        """Test participant login with existing credentials"""
        print("\n🔍 Testing Participant Login...")
        
        # Try to login with test credentials
        login_data = {
            "register_number": "1234567890",
            "password": "testpass123"
        }
        
        success, response = self.run_test("Participant login", "POST", "auth/login", 200, login_data)
        
        if success and 'access_token' in response:
            self.participant_token = response['access_token']
            return True
        return False

    def test_admin_dashboard(self):
        """Test admin dashboard endpoints"""
        if not self.admin_token:
            print("\n❌ Skipping admin tests - no admin token")
            return
            
        print("\n🔍 Testing Admin Dashboard...")
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        # Test dashboard stats
        self.run_test("Admin dashboard stats", "GET", "admin/dashboard", 200, headers=headers)
        
        # Test participants list
        self.run_test("Admin participants list", "GET", "admin/participants", 200, headers=headers)
        
        # Test rounds list
        self.run_test("Admin rounds list", "GET", "admin/rounds", 200, headers=headers)
        
        # Test leaderboard
        self.run_test("Admin leaderboard", "GET", "admin/leaderboard", 200, headers=headers)

    def test_round_creation(self):
        """Test round creation"""
        if not self.admin_token:
            print("\n❌ Skipping round creation - no admin token")
            return
            
        print("\n🔍 Testing Round Creation...")
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        round_data = {
            "name": "Test Round",
            "description": "This is a test round for API testing",
            "tags": ["test", "api"],
            "date": "2026-03-15T10:00:00",
            "mode": "Online",
            "conducted_by": "Test Admin",
            "evaluation_criteria": [
                {
                    "name": "Creativity",
                    "max_marks": 50,
                    "description": "Creative thinking and innovation"
                },
                {
                    "name": "Presentation",
                    "max_marks": 50,
                    "description": "Presentation skills"
                }
            ]
        }
        
        self.run_test("Create round", "POST", "admin/rounds", 200, round_data, headers)

    def test_participant_endpoints(self):
        """Test participant-specific endpoints"""
        if not self.participant_token:
            print("\n❌ Skipping participant tests - no participant token")
            return
            
        print("\n🔍 Testing Participant Endpoints...")
        
        headers = {'Authorization': f'Bearer {self.participant_token}'}
        
        # Test get profile
        self.run_test("Get participant profile", "GET", "me", 200, headers=headers)
        
        # Test get round status
        self.run_test("Get participant rounds", "GET", "me/rounds", 200, headers=headers)

    def test_registration_toggle(self):
        """Test registration toggle functionality"""
        if not self.admin_token:
            print("\n❌ Skipping registration toggle - no admin token")
            return
            
        print("\n🔍 Testing Registration Toggle...")
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        # Toggle registration
        self.run_test("Toggle registration", "POST", "admin/toggle-registration", 200, headers=headers)

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Persofest'26 API Testing...")
        print(f"Testing against: {self.base_url}")
        
        # Basic health tests
        self.test_health_endpoints()
        
        # Public endpoints
        self.test_public_endpoints()
        
        # Authentication tests
        admin_login_success = self.test_admin_login()
        
        # Try participant registration first, then login
        participant_reg_success = self.test_participant_registration()
        if not participant_reg_success:
            self.test_participant_login()
        
        # Admin functionality tests
        if admin_login_success:
            self.test_admin_dashboard()
            self.test_round_creation()
            self.test_registration_toggle()
        
        # Participant functionality tests
        self.test_participant_endpoints()
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed < self.tests_run:
            print(f"\n❌ Failed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = PersofestAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())