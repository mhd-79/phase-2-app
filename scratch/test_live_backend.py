import urllib.request
import json

backend_url = "https://charming-happiness-production-a001.up.railway.app/api/v1/auth/login"

for user, pin in [("owner.arjun", "9999"), ("priya.k", "1234")]:
    payload = json.dumps({"username": user, "pin": pin}).encode("utf-8")
    req = urllib.request.Request(
        backend_url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"SUCCESS for {user}: status={resp.status}, role={data.get('role')}, token_len={len(data.get('access_token', ''))}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error for {user}: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error for {user}: {e}")
