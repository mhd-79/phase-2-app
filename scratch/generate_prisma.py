import os
import subprocess
import sys

scripts_dir = r"C:\Users\Asus\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\LocalCache\local-packages\Python313\Scripts"
env = os.environ.copy()
env["PATH"] = scripts_dir + os.pathsep + env.get("PATH", "")

print("Running prisma db push...")
res1 = subprocess.run([sys.executable, "-m", "prisma", "db", "push"], cwd="backend", env=env)
print("db push Return code:", res1.returncode)

print("Running prisma generate...")
res2 = subprocess.run([sys.executable, "-m", "prisma", "generate"], cwd="backend", env=env)
print("generate Return code:", res2.returncode)
