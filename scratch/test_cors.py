import urllib.request

req = urllib.request.Request(
    "https://okuto-billing-production-8a3c.up.railway.app/api/v1/auth/login",
    method="OPTIONS",
    headers={
        "Origin": "https://ravishing-intuition-production-4f12.up.railway.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        print("Preflight Status:", resp.status)
        print("Allow-Origin:", resp.headers.get("access-control-allow-origin"))
        print("Allow-Methods:", resp.headers.get("access-control-allow-methods"))
        print("Allow-Headers:", resp.headers.get("access-control-allow-headers"))
except Exception as e:
    print("Preflight Exception:", e)
