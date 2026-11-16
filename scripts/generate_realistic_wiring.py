import os
from PIL import Image, ImageDraw, ImageFont

def render_diagram():
    W, H = 1920, 1200
    img = Image.new('RGB', (W, H), color=(15, 23, 42)) # Deep slate background
    draw = ImageDraw.Draw(img)

    # Load system fonts
    try:
        font_h1 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 32)
        font_h2 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
        font_card_title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 20)
        font_pin_bold = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 16)
        font_pin = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 14)
        font_small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 13)
        font_badge = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 13)
        font_warn_title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 15)
        font_warn_text = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 12)
    except Exception:
        font_h1 = font_h2 = font_card_title = font_pin_bold = font_pin = font_small = font_badge = font_warn_title = font_warn_text = ImageFont.load_default()

    # Tech grid background
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(24, 34, 53), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(24, 34, 53), width=1)

    # -------------------------------------------------------------
    # HEADER BAR
    # -------------------------------------------------------------
    draw.rectangle([0, 0, W, 85], fill=(11, 17, 33))
    draw.line([(0, 85), (W, 85)], fill=(51, 65, 85), width=2)
    draw.text((W // 2, 30), "ESP32 TO SX1278 LoRa (433MHz v4.0) REAL WIRING DIAGRAM", fill=(255, 255, 255), font=font_h1, anchor="mm")
    draw.text((W // 2, 62), "EvakWar Node Setup | Meshtastic DIY_V1 Firmware | 8x Female-to-Male (F-M) DuPont Jumper Wires", fill=(56, 189, 248), font=font_h2, anchor="mm")

    # -------------------------------------------------------------
    # 1. DRAW SX1278 LoRa MODULE (Left)
    # -------------------------------------------------------------
    lora_x, lora_y = 70, 160
    lora_w, lora_h = 420, 540

    # Board shadow & PCB (Cyan/Blue)
    draw.rounded_rectangle([lora_x + 8, lora_y + 8, lora_x + lora_w + 8, lora_y + lora_h + 8], radius=16, fill=(8, 12, 22))
    draw.rounded_rectangle([lora_x, lora_y, lora_x + lora_w, lora_y + lora_h], radius=16, fill=(14, 116, 144), outline=(56, 189, 248), width=3)

    # 4 Corner holes
    for hx, hy in [(lora_x + 20, lora_y + 20), (lora_x + lora_w - 20, lora_y + 20),
                   (lora_x + 20, lora_y + lora_h - 20), (lora_x + lora_w - 20, lora_y + lora_h - 20)]:
        draw.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], fill=(217, 119, 6), outline=(254, 240, 138), width=2)
        draw.ellipse([hx - 5, hy - 5, hx + 5, hy + 5], fill=(15, 23, 42))

    # Copper Spring Antenna top right
    ant_x = lora_x + lora_w - 50
    ant_y = lora_y - 50
    draw.rectangle([ant_x - 5, lora_y, ant_x + 5, lora_y + 12], fill=(217, 119, 6))
    for i in range(10):
        ay = ant_y + i * 7
        draw.arc([ant_x - 14, ay, ant_x + 14, ay + 12], start=0, end=360, fill=(245, 158, 11), width=4)
        draw.arc([ant_x - 12, ay + 1, ant_x + 12, ay + 11], start=0, end=360, fill=(251, 191, 36), width=2)
    draw.text((ant_x, ant_y - 15), "433MHz Antenna", fill=(245, 158, 11), font=font_badge, anchor="mm")

    # PCB Silkscreen Title
    draw.text((lora_x + 25, lora_y + 28), "SX1278  LoRa", fill=(255, 255, 255), font=font_card_title)
    draw.text((lora_x + 25, lora_y + 58), "433MHz  v4.0", fill=(186, 230, 253), font=font_pin_bold)

    # Silver Metal RF Shield (Ai-Thinker Ra-02)
    sh_x, sh_y = lora_x + 195, lora_y + 110
    sh_w, sh_h = 205, 360
    draw.rounded_rectangle([sh_x, sh_y, sh_x + sh_w, sh_y + sh_h], radius=10, fill=(203, 213, 225), outline=(241, 245, 249), width=2)
    for ly in range(sh_y + 25, sh_y + sh_h - 20, 35):
        draw.line([(sh_x + 10, ly), (sh_x + sh_w - 10, ly)], fill=(226, 232, 240), width=1)
    draw.text((sh_x + sh_w // 2, sh_y + 60), "Ai-Thinker", fill=(30, 41, 59), font=font_card_title, anchor="mm")
    draw.text((sh_x + sh_w // 2, sh_y + 105), "Ra-02", fill=(15, 23, 42), font=font_h1, anchor="mm")
    draw.text((sh_x + sh_w // 2, sh_y + 150), "SX1278 LoRa Node", fill=(51, 65, 85), font=font_small, anchor="mm")
    draw.text((sh_x + sh_w // 2, sh_y + 175), "433.875 MHz", fill=(71, 85, 105), font=font_pin, anchor="mm")
    draw.ellipse([sh_x + 35, sh_y + 250, sh_x + 75, sh_y + 290], outline=(100, 116, 139), width=2)
    draw.text((sh_x + 55, sh_y + 270), "CE", fill=(71, 85, 105), font=font_badge, anchor="mm")

    # 2x4 Header Area on the PCB
    hdr_box_x = lora_x + 20
    hdr_box_y = lora_y + 110
    hdr_box_w = 155
    hdr_box_h = 360
    draw.rectangle([hdr_box_x, hdr_box_y, hdr_box_x + hdr_box_w, hdr_box_y + hdr_box_h], fill=(12, 74, 110), outline=(255, 255, 255), width=2)

    grid_y_start = hdr_box_y + 15
    row_height = 82
    col_w = 72

    draw.line([(hdr_box_x + col_w, grid_y_start), (hdr_box_x + col_w, grid_y_start + row_height * 4)], fill=(255, 255, 255), width=2)
    for r in range(5):
        ry = grid_y_start + r * row_height
        draw.line([(hdr_box_x + 4, ry), (hdr_box_x + hdr_box_w - 4, ry)], fill=(255, 255, 255), width=2)

    lora_pin_coords = {}
    pin_table_data = [
        (0, 0, "MISO"),
        (1, 0, "SCK"),
        (2, 0, "RST"),
        (3, 0, "GND"),
        (0, 1, "DIO0"),
        (1, 1, "MOSI"),
        (2, 1, "NSS"),
        (3, 1, "3V3"),
    ]

    for row, col, name in pin_table_data:
        cell_cx = hdr_box_x + col * col_w + col_w // 2
        cell_cy = grid_y_start + row * row_height + row_height // 2
        px = cell_cx
        py = cell_cy - 12
        draw.rectangle([px - 15, py - 15, px + 15, py + 15], fill=(15, 23, 42), outline=(51, 65, 85), width=2)
        draw.rectangle([px - 5, py - 5, px + 5, py + 5], fill=(217, 119, 6), outline=(254, 240, 138), width=2)
        draw.text((cell_cx, cell_cy + 18), name, fill=(255, 255, 255), font=font_pin_bold, anchor="mm")
        lora_pin_coords[name] = (px, py)

    # -------------------------------------------------------------
    # 2. DRAW ESP32 DEVKIT V1 (Right)
    # -------------------------------------------------------------
    esp_x, esp_y = 1270, 110
    esp_w, esp_h = 580, 890

    # Board Body
    draw.rounded_rectangle([esp_x + 8, esp_y + 8, esp_x + esp_w + 8, esp_y + esp_h + 8], radius=24, fill=(8, 12, 22))
    draw.rounded_rectangle([esp_x, esp_y, esp_x + esp_w, esp_y + esp_h], radius=24, fill=(24, 24, 27), outline=(71, 85, 105), width=3)

    # 4 Corner holes
    for hx, hy in [(esp_x + 22, esp_y + 22), (esp_x + esp_w - 22, esp_y + 22),
                   (esp_x + 22, esp_y + esp_h - 22), (esp_x + esp_w - 22, esp_y + esp_h - 22)]:
        draw.ellipse([hx - 11, hy - 11, hx + 11, hy + 11], fill=(217, 119, 6), outline=(254, 240, 138), width=2)
        draw.ellipse([hx - 7, hy - 7, hx + 7, hy + 7], fill=(15, 23, 42))

    # ESP-WROOM-32 Metal RF Can
    can_x, can_y = esp_x + 125, esp_y + 60
    can_w, can_h = 330, 360
    draw.rectangle([can_x + 30, esp_y + 16, can_x + can_w - 30, esp_y + 50], fill=(180, 83, 9))
    draw.rounded_rectangle([can_x, can_y, can_x + can_w, can_y + can_h], radius=14, fill=(203, 213, 225), outline=(241, 245, 249), width=3)
    draw.text((can_x + can_w // 2, can_y + 65), "ESPRESSIF", fill=(15, 23, 42), font=font_card_title, anchor="mm")
    draw.text((can_x + can_w // 2, can_y + 115), "ESP-WROOM-32", fill=(15, 23, 42), font=font_h1, anchor="mm")
    draw.text((can_x + can_w // 2, can_y + 165), "Wi-Fi + BT + BLE MCU Module", fill=(51, 65, 85), font=font_badge, anchor="mm")
    draw.text((can_x + can_w // 2, can_y + 195), "FCC ID: 2AC7Z-ESPWROOM32", fill=(71, 85, 105), font=font_small, anchor="mm")
    draw.text((can_x + can_w // 2, can_y + 250), "KCC / CE / RoHS", fill=(100, 116, 139), font=font_small, anchor="mm")

    # Micro-USB port
    usb_x = esp_x + esp_w // 2 - 45
    usb_y = esp_y + esp_h - 45
    draw.rounded_rectangle([usb_x, usb_y, usb_x + 90, usb_y + 55], radius=8, fill=(148, 163, 184), outline=(226, 232, 240), width=3)
    draw.text((esp_x + esp_w // 2, usb_y + 22), "MICRO-USB", fill=(15, 23, 42), font=font_badge, anchor="mm")

    # Buttons
    btn_y = esp_y + esp_h - 110
    draw.rounded_rectangle([esp_x + 130, btn_y, esp_x + 185, btn_y + 38], radius=6, fill=(51, 65, 85), outline=(148, 163, 184), width=1)
    draw.ellipse([esp_x + 150, btn_y + 11, esp_x + 165, btn_y + 26], fill=(203, 213, 225))
    draw.text((esp_x + 157, btn_y - 12), "EN (RST)", fill=(255, 255, 255), font=font_small, anchor="mm")

    draw.rounded_rectangle([esp_x + esp_w - 185, btn_y, esp_x + esp_w - 130, btn_y + 38], radius=6, fill=(51, 65, 85), outline=(148, 163, 184), width=1)
    draw.ellipse([esp_x + esp_w - 165, btn_y + 11, esp_x + esp_w - 150, btn_y + 26], fill=(203, 213, 225))
    draw.text((esp_x + esp_w - 157, btn_y - 12), "BOOT", fill=(255, 255, 255), font=font_small, anchor="mm")

    # LEDs
    draw.rectangle([esp_x + 200, esp_y + 440, esp_x + 220, esp_y + 455], fill=(239, 68, 68))
    draw.text((esp_x + 210, esp_y + 470), "PWR", fill=(239, 68, 68), font=font_small, anchor="mm")
    draw.rectangle([esp_x + esp_w - 220, esp_y + 440, esp_x + esp_w - 200, esp_y + 455], fill=(59, 130, 246))
    draw.text((esp_x + esp_w - 210, esp_y + 470), "IO2", fill=(59, 130, 246), font=font_small, anchor="mm")

    # ESP32 Pin Headers (15 pins Left, 15 pins Right)
    left_pins = [
        ("EN", None),
        ("VP (36)", None),
        ("VN (39)", None),
        ("D34", None),
        ("D35", None),
        ("D32", None),
        ("D33", None),
        ("D25", None),
        ("D26", (168, 85, 247)),  # Target DIO0 (Purple)
        ("D27", (34, 197, 94)),   # Target MOSI (Green)
        ("D14", None),
        ("D12", None),
        ("D13", None),
        ("GND", (148, 163, 184)), # Target GND (Black/Slate)
        ("VIN", None),
    ]

    right_pins = [
        ("D23", (241, 245, 249)), # Target RST (White)
        ("D22", None),
        ("TX0", None),
        ("RX0", None),
        ("D21", None),
        ("D19", (59, 130, 246)),  # Target MISO (Blue)
        ("D18", (249, 115, 22)),  # Target NSS (Orange)
        ("D5",  (234, 179, 8)),   # Target SCK (Yellow)
        ("D17", None),
        ("D16", None),
        ("D4",  None),
        ("D0",  None),
        ("D2",  None),
        ("D15", None),
        ("3V3", (239, 68, 68)),   # Target 3V3 (Red)
    ]

    esp_pin_coords = {}
    pin_y_start = esp_y + 85
    pin_step = 50

    # Draw Left Pin Header
    for idx, (pname, target_color) in enumerate(left_pins):
        py = pin_y_start + idx * pin_step
        px = esp_x + 28
        
        draw.rectangle([px - 14, py - 14, px + 14, py + 14], fill=(15, 23, 42), outline=(245, 158, 11), width=2)
        draw.ellipse([px - 5, py - 5, px + 5, py + 5], fill=(217, 119, 6))

        base_name = pname.split()[0]
        esp_pin_coords[base_name] = (px, py)

        if target_color:
            draw.rounded_rectangle([px + 22, py - 14, px + 88, py + 14], radius=6, fill=(30, 41, 59), outline=target_color, width=2)
            draw.text((px + 55, py), pname, fill=(255, 255, 255), font=font_pin_bold, anchor="mm")
        else:
            draw.text((px + 22, py), pname, fill=(148, 163, 184), font=font_pin, anchor="lm")

    # Draw Right Pin Header
    for idx, (pname, target_color) in enumerate(right_pins):
        py = pin_y_start + idx * pin_step
        px = esp_x + esp_w - 28

        draw.rectangle([px - 14, py - 14, px + 14, py + 14], fill=(15, 23, 42), outline=(245, 158, 11), width=2)
        draw.ellipse([px - 5, py - 5, px + 5, py + 5], fill=(217, 119, 6))

        base_name = pname.split()[0]
        esp_pin_coords[base_name] = (px, py)

        if target_color:
            draw.rounded_rectangle([px - 88, py - 14, px - 22, py + 14], radius=6, fill=(30, 41, 59), outline=target_color, width=2)
            draw.text((px - 55, py), pname, fill=(255, 255, 255), font=font_pin_bold, anchor="mm")
        else:
            draw.text((px - 22, py), pname, fill=(148, 163, 184), font=font_pin, anchor="rm")


    # -------------------------------------------------------------
    # 3. DRAW DUPONT JUMPER WIRES (FEMALE TO MALE)
    # -------------------------------------------------------------
    def draw_path(points_list, color, hl_color):
        draw.line(points_list, fill=(10, 15, 28), width=11)
        draw.line(points_list, fill=color, width=7)
        hl_points = [(px, py - 1) for px, py in points_list]
        draw.line(hl_points, fill=hl_color, width=2)

    def draw_terminals(p_lora, p_esp, color):
        x1, y1 = p_lora
        x2, y2 = p_esp
        # Female DuPont connector on LoRa pin
        draw.rounded_rectangle([x1 - 12, y1 - 12, x1 + 12, y1 + 12], radius=3, fill=(15, 23, 42), outline=(100, 116, 139), width=2)
        draw.rectangle([x1 - 4, y1 - 4, x1 + 4, y1 + 4], fill=(203, 213, 225))
        # Male DuPont connector on ESP32 header
        draw.rounded_rectangle([x2 - 10, y2 - 10, x2 + 10, y2 + 10], radius=3, fill=(30, 41, 59), outline=color, width=2)
        draw.ellipse([x2 - 5, y2 - 5, x2 + 5, y2 + 5], fill=color, outline=(255, 255, 255), width=1)

    def generate_bezier(p0, p1, p2, p3, steps=100):
        res = []
        for s in range(steps + 1):
            t = s / float(steps)
            bx = (1-t)**3 * p0[0] + 3*(1-t)**2*t * p1[0] + 3*(1-t)*t**2 * p2[0] + t**3 * p3[0]
            by = (1-t)**3 * p0[1] + 3*(1-t)**2*t * p1[1] + 3*(1-t)*t**2 * p2[1] + t**3 * p3[1]
            res.append((bx, by))
        return res

    # 1. PURPLE WIRE: DIO0 -> D26 (Left header)
    p_dio0 = lora_pin_coords['DIO0']
    p_d26  = esp_pin_coords['D26']
    pts_dio0 = generate_bezier(
        p_dio0,
        (p_dio0[0] + 300, p_dio0[1] - 40),
        (p_d26[0] - 250, p_d26[1] - 30),
        p_d26
    )
    draw_path(pts_dio0, (168, 85, 247), (233, 213, 255))
    draw_terminals(p_dio0, p_d26, (168, 85, 247))

    # 2. GREEN WIRE: MOSI -> D27 (Left header)
    p_mosi = lora_pin_coords['MOSI']
    p_d27  = esp_pin_coords['D27']
    pts_mosi = generate_bezier(
        p_mosi,
        (p_mosi[0] + 320, p_mosi[1] + 20),
        (p_d27[0] - 220, p_d27[1] + 10),
        p_d27
    )
    draw_path(pts_mosi, (34, 197, 94), (187, 247, 208))
    draw_terminals(p_mosi, p_d27, (34, 197, 94))

    # 3. BLACK WIRE: GND -> GND (Left header)
    p_gnd = lora_pin_coords['GND']
    p_egnd = esp_pin_coords['GND']
    pts_gnd = generate_bezier(
        p_gnd,
        (p_gnd[0] + 280, p_gnd[1] + 110),
        (p_egnd[0] - 250, p_egnd[1] + 50),
        p_egnd
    )
    draw_path(pts_gnd, (51, 65, 85), (148, 163, 184))
    draw_terminals(p_gnd, p_egnd, (51, 65, 85))

    # 4. WHITE WIRE: RST -> D23 (Arcs cleanly over the top)
    p_rst = lora_pin_coords['RST']
    p_d23 = esp_pin_coords['D23']
    pts_rst = generate_bezier(
        p_rst,
        (p_rst[0] + 350, p_rst[1] - 160),
        (p_d23[0] - 80, esp_y - 50),
        p_d23
    )
    draw_path(pts_rst, (241, 245, 249), (255, 255, 255))
    draw_terminals(p_rst, p_d23, (241, 245, 249))

    # 5. BLUE WIRE: MISO -> D19 (Arcs over the top-right and enters D19 from outside right!)
    p_miso = lora_pin_coords['MISO']
    p_d19  = esp_pin_coords['D19']
    pts_miso_1 = generate_bezier(
        p_miso,
        (p_miso[0] + 420, p_miso[1] - 160),
        (esp_x + esp_w + 20, esp_y - 25),
        (esp_x + esp_w + 60, esp_y + 120)
    )
    pts_miso_2 = generate_bezier(
        (esp_x + esp_w + 60, esp_y + 120),
        (esp_x + esp_w + 60, p_d19[1] - 20),
        (p_d19[0] + 35, p_d19[1]),
        p_d19
    )
    draw_path(pts_miso_1 + pts_miso_2, (59, 130, 246), (191, 219, 254))
    draw_terminals(p_miso, p_d19, (59, 130, 246))

    # 6. ORANGE WIRE: NSS -> D18 (Arcs over top-right, enters D18 from outside right)
    p_nss = lora_pin_coords['NSS']
    p_d18 = esp_pin_coords['D18']
    pts_nss_1 = generate_bezier(
        p_nss,
        (p_nss[0] + 460, p_nss[1] - 170),
        (esp_x + esp_w + 60, esp_y - 10),
        (esp_x + esp_w + 100, esp_y + 160)
    )
    pts_nss_2 = generate_bezier(
        (esp_x + esp_w + 100, esp_y + 160),
        (esp_x + esp_w + 100, p_d18[1] - 20),
        (p_d18[0] + 35, p_d18[1]),
        p_d18
    )
    draw_path(pts_nss_1 + pts_nss_2, (249, 115, 22), (254, 215, 170))
    draw_terminals(p_nss, p_d18, (249, 115, 22))

    # 7. YELLOW WIRE: SCK -> D5 (Arcs over top-right, enters D5 from outside right)
    p_sck = lora_pin_coords['SCK']
    p_d5  = esp_pin_coords['D5']
    pts_sck_1 = generate_bezier(
        p_sck,
        (p_sck[0] + 500, p_sck[1] - 180),
        (esp_x + esp_w + 100, esp_y + 10),
        (esp_x + esp_w + 140, esp_y + 200)
    )
    pts_sck_2 = generate_bezier(
        (esp_x + esp_w + 140, esp_y + 200),
        (esp_x + esp_w + 140, p_d5[1] - 20),
        (p_d5[0] + 35, p_d5[1]),
        p_d5
    )
    draw_path(pts_sck_1 + pts_sck_2, (234, 179, 8), (254, 240, 138))
    draw_terminals(p_sck, p_d5, (234, 179, 8))

    # 8. RED WIRE: 3V3 -> 3V3 (Arcs gracefully under bottom)
    p_3v3  = lora_pin_coords['3V3']
    p_e3v3 = esp_pin_coords['3V3']
    pts_3v3 = generate_bezier(
        p_3v3,
        (p_3v3[0] + 350, p_3v3[1] + 200),
        (p_e3v3[0] - 180, esp_y + esp_h + 30),
        p_e3v3
    )
    draw_path(pts_3v3, (239, 68, 68), (254, 202, 202))
    draw_terminals(p_3v3, p_e3v3, (239, 68, 68))


    # -------------------------------------------------------------
    # 4. BREADBOARD WARNING BOX (Bottom Left)
    # -------------------------------------------------------------
    warn_x, warn_y = 70, 750
    warn_w, warn_h = 420, 390
    draw.rounded_rectangle([warn_x, warn_y, warn_x + warn_w, warn_y + warn_h], radius=16, fill=(30, 27, 24), outline=(239, 68, 68), width=3)
    
    draw.rectangle([warn_x, warn_y, warn_x + warn_w, warn_y + 44], fill=(153, 27, 27))
    draw.text((warn_x + 20, warn_y + 22), "STOP! DO NOT PLUG 2x4 INTO BREADBOARD", fill=(255, 255, 255), font=font_warn_title, anchor="lm")
    
    warn_lines = [
        ("WHY IT IS IMPOSSIBLE ON A BREADBOARD:", True, (254, 202, 202)),
        ("Standard breadboards connect every 5 holes in a vertical", False, (226, 232, 240)),
        ("column underneath using a single metal spring clip.", False, (226, 232, 240)),
        ("", False, (226, 232, 240)),
        ("If you push the 2x4 LoRa header into breadboard holes:", False, (226, 232, 240)),
        ("  * GND and 3V3 will land on the SAME column!", True, (252, 165, 165)),
        ("  * This causes an INSTANT DEAD SHORT CIRCUIT", True, (239, 68, 68)),
        ("    between 3.3V power and Ground!", True, (239, 68, 68)),
        ("  * Your ESP32 regulator will overheat and fry!", True, (252, 165, 165)),
        ("", False, (226, 232, 240)),
        ("THE PROPER SOLUTION (100% SAFE):", True, (56, 189, 248)),
        ("Use 8 Female-to-Male (F-M) DuPont jumper wires:", False, (226, 232, 240)),
        ("  -> Push FEMALE ends onto LoRa 2x4 pins.", False, (248, 250, 252)),
        ("  -> Plug MALE ends into ESP32 board directly.", False, (248, 250, 252)),
    ]
    cur_y = warn_y + 60
    for line, is_bold, col in warn_lines:
        if line == "":
            cur_y += 8
            continue
        draw.text((warn_x + 18, cur_y), line, fill=col, font=font_warn_title if is_bold else font_warn_text)
        cur_y += 21


    # -------------------------------------------------------------
    # 5. STEP-BY-STEP PIN CONNECTION TABLE (Bottom Center)
    # -------------------------------------------------------------
    tbl_x, tbl_y = 520, 750
    tbl_w, tbl_h = 710, 390
    draw.rounded_rectangle([tbl_x, tbl_y, tbl_x + tbl_w, tbl_y + tbl_h], radius=16, fill=(15, 23, 42), outline=(56, 189, 248), width=2)
    
    draw.rectangle([tbl_x, tbl_y, tbl_x + tbl_w, tbl_y + 44], fill=(14, 116, 144))
    draw.text((tbl_x + 20, tbl_y + 22), "EXACT PIN-TO-PIN CONNECTION CHECKLIST (STEP-BY-STEP)", fill=(255, 255, 255), font=font_warn_title, anchor="lm")

    draw.text((tbl_x + 30,  tbl_y + 62), "WIRE COLOR", fill=(148, 163, 184), font=font_badge)
    draw.text((tbl_x + 160, tbl_y + 62), "LoRa PIN (2x4 Header)", fill=(148, 163, 184), font=font_badge)
    draw.text((tbl_x + 360, tbl_y + 62), "ESP32 PIN", fill=(148, 163, 184), font=font_badge)
    draw.text((tbl_x + 490, tbl_y + 62), "HARDWARE FUNCTION", fill=(148, 163, 184), font=font_badge)
    draw.line([(tbl_x + 15, tbl_y + 82), (tbl_x + tbl_w - 15, tbl_y + 82)], fill=(51, 65, 85), width=1)

    table_rows = [
        ("RED",    (239, 68, 68),   "3V3  (Right Col, Row 4)", "3V3 (or 3.3V)", "Power 3.3V (NEVER 5V/VIN!)"),
        ("BLACK",  (51, 65, 85),    "GND  (Left Col, Row 4)",  "GND",           "Common Ground"),
        ("ORANGE", (249, 115, 22),  "NSS  (Right Col, Row 3)", "D18 (GPIO 18)", "SPI Chip Select (NSS/CS)"),
        ("GREEN",  (34, 197, 94),   "MOSI (Right Col, Row 2)", "D27 (GPIO 27)", "SPI Data MOSI"),
        ("BLUE",   (59, 130, 246),  "MISO (Left Col, Row 1)",  "D19 (GPIO 19)", "SPI Data MISO"),
        ("YELLOW", (234, 179, 8),   "SCK  (Left Col, Row 2)",  "D5  (GPIO 5)",  "SPI Clock (SCK)"),
        ("WHITE",  (241, 245, 249), "RST  (Left Col, Row 3)",  "D23 (GPIO 23)", "LoRa Radio Reset"),
        ("PURPLE", (168, 85, 247),  "DIO0 (Right Col, Row 1)", "D26 (GPIO 26)", "Packet RX Interrupt (IRQ)"),
    ]

    for idx, (color_name, col_val, lora_p, esp_p, desc) in enumerate(table_rows):
        ry = tbl_y + 110 + idx * 32
        draw.rounded_rectangle([tbl_x + 25, ry - 8, tbl_x + 50, ry + 8], radius=3, fill=col_val, outline=(255, 255, 255), width=1)
        draw.text((tbl_x + 58, ry), color_name, fill=(241, 245, 249), font=font_small, anchor="lm")
        draw.text((tbl_x + 160, ry), lora_p, fill=(56, 189, 248), font=font_pin_bold, anchor="lm")
        draw.text((tbl_x + 360, ry), esp_p, fill=(250, 204, 21), font=font_pin_bold, anchor="lm")
        draw.text((tbl_x + 490, ry), desc, fill=(203, 213, 225), font=font_small, anchor="lm")
        draw.line([(tbl_x + 20, ry + 16), (tbl_x + tbl_w - 20, ry + 16)], fill=(30, 41, 59), width=1)

    # Output paths
    out_dir_1 = r"c:\Users\lausi\OneDrive\Desktop\EBAKWAR\public\img"
    out_dir_2 = r"C:\Users\lausi\.gemini\antigravity\brain\407c1ce1-50ce-4194-9ebd-51fd8e1398eb"
    
    os.makedirs(out_dir_1, exist_ok=True)
    os.makedirs(out_dir_2, exist_ok=True)
    
    path1 = os.path.join(out_dir_1, "esp32_sx1278_real_wiring.png")
    path2 = os.path.join(out_dir_2, "esp32_sx1278_real_wiring.png")
    
    img.save(path1, "PNG", quality=95)
    img.save(path2, "PNG", quality=95)
    print(f"Diagram successfully rendered and saved to:\n1) {path1}\n2) {path2}")

if __name__ == '__main__':
    render_diagram()
