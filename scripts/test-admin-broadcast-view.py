import urllib.request
import urllib.parse
import http.cookiejar
import re

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Get login page
resp = opener.open('http://localhost:8080/login')
html = resp.read().decode('utf-8')
csrf_m = re.search(r'name="_csrf" value="([^"]+)"', html)
csrf = csrf_m.group(1) if csrf_m else ''

# 2. Login
login_data = urllib.parse.urlencode({
    'email': 'monettes@gmail.com',
    'password': 'Password123!',
    '_csrf': csrf
}).encode('utf-8')

try:
    login_resp = opener.open('http://localhost:8080/login', data=login_data)
    print('Login URL:', login_resp.url)

    # 3. Access /admin/broadcast
    b_resp = opener.open('http://localhost:8080/admin/broadcast')
    b_html = b_resp.read().decode('utf-8')
    print('Broadcast HTTP Status:', b_resp.status)
    print('Broadcast Page Length:', len(b_html))
    print('Has "433.875 MHz":', '433.875 MHz' in b_html)
    print('Has "EVW|ALT":', 'EVW|ALT' in b_html)
    print('Has "Node 1: Hall Gateway":', 'Node 1: Hall Gateway' in b_html)
    print('Has "iProgSMS":', 'iProgSMS' in b_html)
    print('Has "SMS Broadcast":', 'SMS Broadcast' in b_html)
    print('Has "LoRa Mesh Emergency Alert Dispatcher":', 'LoRa Mesh Emergency Alert Dispatcher' in b_html)
except Exception as e:
    print('Error:', e)
