import subprocess
import json

ps_cmd = """
Get-PnpDevice -InstanceId 'FTDIBUS\\VID_0403+PID_6001+A5069RR4A\\0000' | Select-Object FriendlyName, InstanceId, Status, Problem, ProblemDescription | ConvertTo-Json
"""

res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
