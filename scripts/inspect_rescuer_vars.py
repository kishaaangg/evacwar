import re

with open('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/controllers/rescuerController.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'res.render(' in line:
        print(f"Line {i+1}: {line.strip()[:60]}")
        start = max(0, i-6)
        end = min(len(lines), i+16)
        for k in range(start, end):
            print(f"  {k+1}: {lines[k]}", end="")
        print("---------------------------------")
