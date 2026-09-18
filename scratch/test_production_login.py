import urllib.request
import json

urls = [
    "https://okuto-billing-production-8a3c.up.railway.app/api/v1/auth/login",
    "https://ravishing-intuition-production-4f12.up.railway.app/api/v1/auth/login"
]

for url in urls:
    print(f"\n--- Testing: {url} ---")
    payload = json.dumps({"username": "owner.arjun", "pin": "9999", "role": "admin"}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"SUCCESS: HTTP {resp.status} - User: {data.get('username')}, Role: {data.get('role')}, Token: {bool(data.get('access_token'))}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Exception: {e}")
