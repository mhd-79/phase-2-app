"""
Create (or reset the password of) a platform Super Admin.

Run from the backend folder (uses DATABASE_URL from backend/.env exactly like the API does):

    python -m scripts.create_super_admin --email owner@yourcompany.com --name "Platform Admin"
    python -m scripts.create_super_admin --email owner@yourcompany.com --reset      # set a new password for an existing account

The password is asked for interactively (not echoed) unless SUPER_ADMIN_PASSWORD is set in the environment.
The API also creates the first Super Admin on startup from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD when none exists.
"""
import argparse
import asyncio
import getpass
import os
import sys

from app import platform_service as svc
from app.database import control_db


async def main(email: str, name: str, reset: bool) -> int:
    email = email.strip().lower()
    password = os.getenv("SUPER_ADMIN_PASSWORD") or getpass.getpass("Password: ")
    if not os.getenv("SUPER_ADMIN_PASSWORD") and password != getpass.getpass("Repeat password: "):
        print("The passwords do not match.")
        return 1
    try:
        svc.validate_password(password)
    except Exception as exc:                                    # HTTPException from the shared password rule
        print(f"Password rejected: {getattr(exc, 'detail', exc)}")
        return 1
    await control_db.connect()
    try:
        existing = await control_db.platformuser.find_unique(where={"email": email})
        if existing and not reset:
            print(f"{email} already exists. Use --reset to set a new password.")
            return 1
        if existing:
            await control_db.platformuser.update(where={"email": email}, data={"password_hash": svc.hash_password(password), "is_active": True})
            print(f"Password updated for {email}.")
        else:
            if await control_db.tenant.find_first(where={"email": email}):
                print("That email already belongs to a business owner.")
                return 1
            await control_db.platformuser.create(data={"email": email, "full_name": name, "password_hash": svc.hash_password(password)})
            print(f"Super Admin {email} created. Sign in at the app's login page with 'Email and password'.")
        return 0
    finally:
        await control_db.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Platform Super Admin")
    parser.add_argument("--reset", action="store_true", help="set a new password for an existing account")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.email, args.name, args.reset)))
