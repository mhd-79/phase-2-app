import subprocess

psql = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
p = subprocess.run([psql, "-U", "postgres", "-d", "postgres", "-c", "SELECT 1;"], capture_output=True, text=True)
print("Returncode:", p.returncode)
print("Stdout:", p.stdout)
print("Stderr:", p.stderr)
