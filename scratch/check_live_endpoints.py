import urllib.request
import json

base = "https://charming-happiness-production-a001.up.railway.app"

for ep in ["/", "/api/v1/catalog/items", "/api/v1/catalog/categories", "/api/v1/settings/store", "/api/v1/users"]:
    req = urllib.request.Request(f"{base}{ep}")
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"GET {ep} -> {resp.status} : {resp.read().decode('utf-8')[:150]}")
    except urllib.error.HTTPError as e:
        print(f"GET {ep} -> {e.code} : {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"GET {ep} -> Exception : {e}")
