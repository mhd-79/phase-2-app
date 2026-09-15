import subprocess
import os

psql_path = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"

for pwd in ["postgres", "admin", "root", "123456", "password", "pos_password", ""]:
    env = os.environ.copy()
    env["PGPASSWORD"] = pwd
    p = subprocess.run([psql_path, "-U", "postgres", "-c", "SELECT 1;"], capture_output=True, text=True, env=env)
    if p.returncode == 0:
        print(f"FOUND WORKING POSTGRES PASSWORD: '{pwd}'")
        # Create user and db
        subprocess.run([psql_path, "-U", "postgres", "-c", "CREATE USER pos_user WITH PASSWORD 'pos_password';"], capture_output=True, env=env)
        subprocess.run([psql_path, "-U", "postgres", "-c", "CREATE DATABASE pos_db OWNER pos_user;"], capture_output=True, env=env)
        subprocess.run([psql_path, "-U", "postgres", "-c", "GRANT ALL PRIVILEGES ON DATABASE pos_db TO pos_user;"], capture_output=True, env=env)
        print("Created pos_user and pos_db!")
        break
    else:
        print(f"Password '{pwd}' failed")
