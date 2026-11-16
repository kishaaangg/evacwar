import os
from PIL import Image, ImageDraw, ImageFont

def draw_wiring_diagram():
    # Canvas dimensions
    width, height = 1500, 1000
    img = Image.new('RGB', (width, height), color=(15, 23, 42)) # Deep slate background
    draw = ImageDraw.Draw(img)

    # Fonts
    font_title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 32)
    font_subtitle = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18)
    font_header = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 20)
    font_label = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 14)
    font_pin = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 13)
    font_legend = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 15)

    # Title header
    draw.text((width // 2, 35), "ESP32 to SX1278 LoRa (433MHz v4.0) Wiring Diagram", fill=(255, 255, 255), font=font_title, anchor="mm")
    draw.text((width // 2, 75), "EvakWar Node Hardware Configuration (Meshtastic DIY_V1 Firmware)", fill=(148, 163, 184), font=font_subtitle, anchor="mm")

    # ==========================================
    # 1. DRAW SX1278 LoRa MODULE (Left side)
    # ==========================================
    lora_x, lora_y = 120, 260
    lora_w, lora_h = 360, 480

    # Module PCB Drop Shadow & Board
    draw.rounded_rectangle([lora_x + 6, lora_y + 6, lora_x + lora_w + 6, lora_y + lora_h + 6], radius=16, fill=(10, 15, 30))
    draw.rounded_rectangle([lora_x, lora_y, lora_x + lora_w, lora_y + lora_h], radius=16, fill=(14, 116, 144), outline=(56, 189, 248), width=3)

    # Silkscreen title on Blue PCB
    draw.text((lora_x + lora_w // 2, lora_y + 35), "SX1278  LoRa", fill=(255, 255, 255), font=font_header, anchor="mm")
    draw.text((lora_x + lora_w // 2, lora_y + 65), "433MHz  v4.0", fill=(224, 242, 254), font=font_header, anchor="mm")

    # Spring / Helical Antenna graphic on top right
    ant_x = lora_x + lora_w - 40
    ant_y = lora_y - 80
    draw.rectangle([ant_x - 5, lora_y, ant_x + 5, lora_y + 20], fill=(217, 119, 6))
    for i in range(10):
        ay = ant_y + i * 8
        draw.arc([ant_x - 14, ay, ant_x + 14, ay + 14], start=0, end=360, fill=(245, 158, 11), width=4)
    draw.text((ant_x, ant_y - 20), "433MHz Antenna", fill=(245, 158, 11), font=font_pin, anchor="mm")

    # Metal Shield in center of LoRa module
    draw.rounded_rectangle([lora_x + 150, lora_y + 130, lora_x + lora_w - 20, lora_y + 430], radius=8, fill=(148, 163, 184), outline=(203, 213, 225), width=2)
    draw.text((lora_x + 245, lora_y + 280), "Ai-Thinker\nRa-02 / SX1278", fill=(51, 65, 85), font=font_header, anchor="mm", align="center")

    # 2x4 Male Header Block on Blue LoRa Board
    hdr_x, hdr_y = lora_x + 30, lora_y + 150
    hdr_w, hdr_h = 90, 240
    draw.rectangle([hdr_x - 8, hdr_y - 8, hdr_x + hdr_w + 8, hdr_y + hdr_h + 8], fill=(15, 23, 42), outline=(100, 116, 139), width=2)

    # 2x4 Pins dictionary with coordinates
    lora_pins = {
        # Col 0 (Left), Row 0..3
        'MISO': (hdr_x + 18, hdr_y + 25),
        'SCK':  (hdr_x + 18, hdr_y + 85),
        'RST':  (hdr_x + 18, hdr_y + 145),
        'GND':  (hdr_x + 18, hdr_y + 205),
        # Col 1 (Right), Row 0..3
        'DIO0': (hdr_x + 72, hdr_y + 25),
        'MOSI': (hdr_x + 72, hdr_y + 85),
        'NSS':  (hdr_x + 72, hdr_y + 145),
        '3V3':  (hdr_x + 72, hdr_y + 205),
    }

    # Draw pins and labels
    for name, (px, py) in lora_pins.items():
        # Golden square solder pad & pin circle
        draw.rectangle([px - 14, py - 14, px + 14, py + 14], fill=(30, 41, 59), outline=(245, 158, 11), width=2)
        draw.ellipse([px - 7, py - 7, px + 7, py + 7], fill=(217, 119, 6), outline=(254, 240, 138), width=2)
        # Pin label text
        align = "right" if px < (hdr_x + 45) else "left"
        tx = px - 20 if align == "right" else px + 20
        draw.text((tx, py), name, fill=(255, 255, 255), font=font_label, anchor="rm" if align == "right" else "lm")

    # ==========================================
    # 2. DRAW ESP32 DEVELOPMENT BOARD (Right side)
    # ==========================================
    esp_x, esp_y = 960, 140
    esp_w, esp_h = 440, 750

    # Board Drop Shadow & PCB
    draw.rounded_rectangle([esp_x + 8, esp_y + 8, esp_x + esp_w + 8, esp_y + esp_h + 8], radius=22, fill=(10, 15, 30))
    draw.rounded_rectangle([esp_x, esp_y, esp_x + esp_w, esp_y + esp_h], radius=22, fill=(24, 24, 27), outline=(71, 85, 105), width=3)

    # Silver ESP-WROOM-32 Shield
    draw.rounded_rectangle([esp_x + 75, esp_y + 40, esp_x + esp_w - 75, esp_y + 350], radius=12, fill=(203, 213, 225), outline=(241, 245, 249), width=3)
    draw.text((esp_x + esp_w // 2, esp_y + 160), "ESP-WROOM-32", fill=(15, 23, 42), font=font_header, anchor="mm")
    draw.text((esp_x + esp_w // 2, esp_y + 200), "Wi-Fi + BT + BLE", fill=(51, 65, 85), font=font_pin, anchor="mm")
    draw.text((esp_x + esp_w // 2, esp_y + 230), "FCC ID: 2AC7Z-ESPWROOM32", fill=(71, 85, 105), font=font_pin, anchor="mm")

    # Antenna trace top section
    draw.rectangle([esp_x + 110, esp_y + 15, esp_x + esp_w - 110, esp_y + 38], fill=(180, 83, 9))

    # USB Port at bottom
    draw.rounded_rectangle([esp_x + esp_w // 2 - 35, esp_y + esp_h - 45, esp_x + esp_w // 2 + 35, esp_y + esp_h + 10], radius=6, fill=(148, 163, 184), outline=(226, 232, 240), width=2)
    draw.text((esp_x + esp_w // 2, esp_y + esp_h - 22), "USB", fill=(15, 23, 42), font=font_label, anchor="mm")

    # Buttons: EN and BOOT
    draw.rounded_rectangle([esp_x + 90, esp_y + esp_h - 100, esp_x + 140, esp_y + esp_h - 60], radius=6, fill=(51, 65, 85))
    draw.text((esp_x + 115, esp_y + esp_h - 80), "EN", fill=(255, 255, 255), font=font_pin, anchor="mm")

    draw.rounded_rectangle([esp_x + esp_w - 140, esp_y + esp_h - 100, esp_x + esp_w - 90, esp_y + esp_h - 60], radius=6, fill=(51, 65, 85))
    draw.text((esp_x + esp_w - 115, esp_y + esp_h - 80), "BOOT", fill=(255, 255, 255), font=font_pin, anchor="mm")

    # ESP32 Pin Headers (15 pins Left, 15 pins Right)
    left_pins = [
        "EN", "VP (36)", "VN (39)", "D34", "D35", "D32", "D33", "D25",
        "D26", "D27", "D14", "D12", "D13", "GND", "VIN"
    ]
    right_pins = [
        "D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5",
        "D17", "D16", "D4", "D0", "D2", "D15", "3V3"
    ]

    esp_pin_coords = {}
    pin_y_start = esp_y + 80
    pin_step = 42

    # Draw Left Pin Header
    for idx, pname in enumerate(left_pins):
        py = pin_y_start + idx * pin_step
        px = esp_x + 22
        # Solder ring
        draw.ellipse([px - 10, py - 10, px + 10, py + 10], fill=(15, 23, 42), outline=(245, 158, 11), width=2)
        draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(217, 119, 6))
        # Highlight target pins
        is_target = pname in ["D26", "D27", "GND"]
        color = (255, 255, 255) if is_target else (148, 163, 184)
        if is_target:
            draw.rectangle([px + 16, py - 11, px + 90, py + 11], fill=(30, 41, 59), outline=(56, 189, 248), width=1)
        draw.text((px + 22, py), pname, fill=color, font=font_label if is_target else font_pin, anchor="lm")
        esp_pin_coords[pname.split()[0]] = (px, py)

    # Draw Right Pin Header
    for idx, pname in enumerate(right_pins):
        py = pin_y_start + idx * pin_step
        px = esp_x + esp_w - 22
        draw.ellipse([px - 10, py - 10, px + 10, py + 10], fill=(15, 23, 42), outline=(245, 158, 11), width=2)
        draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(217, 119, 6))
        is_target = pname in ["D23", "D19", "D18", "D5", "3V3"]
        color = (255, 255, 255) if is_target else (148, 163, 184)
        if is_target:
            draw.rectangle([px - 85, py - 11, px - 16, py + 11], fill=(30, 41, 59), outline=(56, 189, 248), width=1)
        draw.text((px - 22, py), pname, fill=color, font=font_label if is_target else font_pin, anchor="rm")
        esp_pin_coords[pname.split()[0]] = (px, py)

    # ==========================================
    # 3. DRAW CONNECTING JUMPER WIRES
    # ==========================================
    # Connections: (LoRa Pin, ESP32 Pin, Wire Color, Wire Name)
    connections = [
        ('3V3',  '3V3', (239, 68, 68),   'RED: 3.3V Power'),
        ('GND',  'GND', (30, 41, 59),    'BLACK: Ground (GND)'),
        ('NSS',  'D18', (249, 115, 22),  'ORANGE: Chip Select (NSS/CS -> D18)'),
        ('MOSI', 'D27', (34, 197, 94),   'GREEN: Master Out (MOSI -> D27)'),
        ('MISO', 'D19', (59, 130, 246),  'BLUE: Master In (MISO -> D19)'),
        ('SCK',  'D5',  (234, 179, 8),   'YELLOW: SPI Clock (SCK -> D5)'),
        ('RST',  'D23', (241, 245, 249), 'WHITE: Radio Reset (RST -> D23)'),
        ('DIO0', 'D26', (168, 85, 247),  'PURPLE: Interrupt (DIO0 -> D26)'),
    ]

    # Function to draw a smooth bezier-like curved line with outline
    def draw_wire(p1, p2, color, arc_offset):
        x1, y1 = p1
        x2, y2 = p2
        # Intermediate control points
        cx1 = x1 + (x2 - x1) * 0.4 + arc_offset
        cy1 = y1 - 30 + arc_offset * 0.2
        cx2 = x1 + (x2 - x1) * 0.6 + arc_offset
        cy2 = y2 + 30 - arc_offset * 0.2

        points = []
        for t_step in range(101):
            t = t_step / 100.0
            # Cubic bezier formula
            bx = (1 - t)**3 * x1 + 3 * (1 - t)**2 * t * cx1 + 3 * (1 - t) * t**2 * cx2 + t**3 * x2
            by = (1 - t)**3 * y1 + 3 * (1 - t)**2 * t * cy1 + 3 * (1 - t) * t**2 * cy2 + t**3 * y2
            points.append((bx, by))

        # Black border for realistic wire depth
        draw.line(points, fill=(15, 23, 42), width=9)
        # Colored wire body
        draw.line(points, fill=color, width=5)
        # Solder joint dots at both ends
        draw.ellipse([x1 - 5, y1 - 5, x1 + 5, y1 + 5], fill=color, outline=(255, 255, 255), width=1)
        draw.ellipse([x2 - 5, y2 - 5, x2 + 5, y2 + 5], fill=color, outline=(255, 255, 255), width=1)

    wire_offsets = {
        '3V3': 70,
        'GND': -90,
        'NSS': 40,
        'MOSI': -40,
        'MISO': 90,
        'SCK': 10,
        'RST': 120,
        'DIO0': -70,
    }

    for l_pin, e_pin, w_color, _ in connections:
        p1 = lora_pins[l_pin]
        p2 = esp_pin_coords[e_pin]
        offset = wire_offsets.get(l_pin, 0)
        draw_wire(p1, p2, w_color, offset)

    # ==========================================
    # 4. DRAW WIRING COLOR LEGEND (Bottom center)
    # ==========================================
    leg_x, leg_y = 120, 810
    leg_w, leg_h = 1280, 150
    draw.rounded_rectangle([leg_x, leg_y, leg_x + leg_w, leg_y + leg_h], radius=14, fill=(30, 41, 59), outline=(71, 85, 105), width=2)
    draw.text((leg_x + 20, leg_y + 18), "WIRE COLOR GUIDE (Match exactly with your Female-to-Male jumper wires):", fill=(248, 250, 252), font=font_legend)

    col1 = connections[:4]
    col2 = connections[4:]

    for i, (_, _, col, desc) in enumerate(col1):
        cy = leg_y + 55 + i * 22
        draw.rounded_rectangle([leg_x + 30, cy - 6, leg_x + 54, cy + 8], radius=3, fill=col, outline=(255, 255, 255), width=1)
        draw.text((leg_x + 65, cy), desc, fill=(226, 232, 240), font=font_pin, anchor="lm")

    for i, (_, _, col, desc) in enumerate(col2):
        cy = leg_y + 55 + i * 22
        draw.rounded_rectangle([leg_x + 640, cy - 6, leg_x + 664, cy + 8], radius=3, fill=col, outline=(255, 255, 255), width=1)
        draw.text((leg_x + 675, cy), desc, fill=(226, 232, 240), font=font_pin, anchor="lm")

    # Save output
    out_path1 = r"c:\Users\lausi\OneDrive\Desktop\EBAKWAR\public\img\esp32_lora_wiring.png"
    out_path2 = r"C:\Users\lausi\.gemini\antigravity\brain\407c1ce1-50ce-4194-9ebd-51fd8e1398eb\esp32_lora_wiring.png"
    img.save(out_path1, "PNG")
    img.save(out_path2, "PNG")
    print(f"Diagram successfully saved to {out_path1}")

if __name__ == '__main__':
    draw_wiring_diagram()
