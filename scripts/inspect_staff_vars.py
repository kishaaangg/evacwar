import re

with open('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/controllers/staffController.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'res.render(' in line:
        print(f"Line {i+1}: {line.strip()[:60]}")
        for j in range(max(0, i-15), min(len(lines), i+25)):
            if 'res.render(' in lines[j]:
                # print 20 lines around render
                start = max(0, j-10)
                end = min(len(lines), j+20)
                for k in range(start, end):
                    print(f"  {k+1}: {lines[k]}", end="")
                print("---------------------------------")
                break
