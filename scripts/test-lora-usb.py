#!/usr/bin/env python3
"""
EvakWar 433.875 MHz LoRa USB Live Diagnostic & Chat Tester
- Auto-detects the connected ESP32 Meshtastic USB COM port
- Prints live incoming EVW|MSG| / EVW|MACK| RF packets with RSSI, SNR, and latency
- Lets you type messages to transmit over 433.875 MHz and measures round-trip EVW|MACK time
"""
import sys
import time
import random
import struct
import threading
import serial
import serial.tools.list_ports

def encode_varint(v):
    out = bytearray()
    v &= 0xFFFFFFFF
    while v > 0x7F:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v & 0x7F)
    return bytes(out)

def encode_ld(fn, data):
    return encode_varint((fn << 3) | 2) + encode_varint(len(data)) + data

def encode_varint_field(fn, val):
    return encode_varint((fn << 3) | 0) + encode_varint(val)

def encode_fixed32_field(fn, val):
    return bytes([(fn << 3) | 5]) + struct.pack('<I', val & 0xFFFFFFFF)

def wrap_frame(proto):
    return bytes([0x94, 0xC3, (len(proto) >> 8) & 0xFF, len(proto) & 0xFF]) + proto

def encode_text_toradio(text):
    data_msg = encode_varint_field(1, 1) + encode_ld(2, text.encode('utf-8'))
    pkt_id = random.randint(1000, 0x7FFFFFFF)
    mesh_pkt = (
        encode_fixed32_field(2, 0xFFFFFFFF)
        + encode_ld(4, data_msg)
        + encode_fixed32_field(6, pkt_id)
        + encode_varint_field(9, 3)
    )
    return encode_ld(1, mesh_pkt)

def read_proto_fields(b):
    fields = []
    pos, n = 0, len(b)
    def rvar():
        nonlocal pos
        res, shift = 0, 0
        while pos < n and shift < 64:
            byte = b[pos]; pos += 1
            res |= (byte & 0x7F) << shift
            if (byte & 0x80) == 0:
                return res
            shift += 7
        return res
    while pos < n:
        tag = rvar()
        if not tag:
            break
        fn, wt = tag >> 3, tag & 7
        if wt == 0:
            fields.append((fn, wt, rvar()))
        elif wt == 1:
            pos += 8
        elif wt == 2:
            slen = rvar()
            if pos + slen > n:
                break
            fields.append((fn, wt, b[pos:pos+slen]))
            pos += slen
        elif wt == 5:
            if pos + 4 > n:
                break
            val_u32 = struct.unpack('<I', b[pos:pos+4])[0]
            val_f32 = struct.unpack('<f', b[pos:pos+4])[0]
            fields.append((fn, wt, (val_u32, val_f32)))
            pos += 4
        else:
            break
    return fields

def pick_port():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("[ERROR] No USB COM ports found! Plug in your ESP32 LoRa node first.")
        return None
    print("\nDetected COM ports:")
    for idx, p in enumerate(ports, 1):
        print(f"  {idx}. {p.device} - {p.description}")
    if len(ports) == 1:
        return ports[0].device
    sel = input("Select port number [1]: ").strip() or "1"
    return ports[int(sel) - 1].device

def main():
    print("============================================================")
    print("  EvakWar 433.875 MHz LoRa USB Live Diagnostic & Chat Test  ")
    print("============================================================")
    print("NOTE: Close or disconnect Chrome WebSerial first so COM port is free!\n")

    port_name = sys.argv[1] if len(sys.argv) > 1 else pick_port()
    if not port_name:
        return

    try:
        ser = serial.Serial()
        ser.port = port_name
        ser.baudrate = 115200
        ser.timeout = 0.1
        ser.dtr = False
        ser.rts = False
        ser.open()
    except Exception as e:
        print(f"\n[ERROR] Cannot open {port_name}: {e}")
        print("-> Make sure Chrome / Admin Web has disconnected from this COM port first!")
        return

    print(f"[OK] Opened {port_name} at 115200 baud.")
    time.sleep(0.25)
    ser.write(bytes([0xC3] * 32))
    time.sleep(0.1)
    ser.write(wrap_frame(encode_varint_field(3, 4242)))
    print("[OK] Sent Meshtastic wake preamble + want_config_id.")
    print("Listening for 433.875 MHz RF packets... Type any text + Enter to send a test chat (or 'quit').\n")

    sent_times = {}
    stop_flag = False
    write_lock = threading.Lock()

    def send_frame(proto):
        with write_lock:
            ser.write(wrap_frame(proto))

    def heartbeat_loop():
        while not stop_flag:
            time.sleep(20)
            if not stop_flag:
                try:
                    send_frame(bytes([0x3A, 0x00]))
                except Exception:
                    pass

    def reader_loop():
        buf = bytearray()
        while not stop_flag:
            try:
                chunk = ser.read(512)
            except Exception:
                break
            if not chunk:
                continue
            buf.extend(chunk)
            cursor = 0
            while cursor <= len(buf) - 4:
                if buf[cursor] == 0x94 and buf[cursor+1] == 0xC3:
                    flen = (buf[cursor+2] << 8) | buf[cursor+3]
                    if 2 <= flen <= 512:
                        if cursor + 4 + flen <= len(buf):
                            frame = bytes(buf[cursor+4:cursor+4+flen])
                            cursor += 4 + flen
                            fr = read_proto_fields(frame)
                            for fn, wt, val in fr:
                                if fn == 2 and wt == 2: # MeshPacket
                                    pf = read_proto_fields(val)
                                    from_id, snr, rssi, decoded = None, None, None, None
                                    for pfn, pwt, pval in pf:
                                        if pfn == 1 and pwt == 5:
                                            from_id = f"!{pval[0]:08x}"
                                        elif pfn == 4 and pwt == 2:
                                            decoded = pval
                                        elif pfn == 8 and pwt == 5:
                                            snr = round(pval[1], 1)
                                        elif pfn == 12 and pwt == 0:
                                            rssi = pval - (1 << 32) if pval > 0x7FFFFFFF else pval
                                    if decoded:
                                        df = read_proto_fields(decoded)
                                        portnum, payload = None, None
                                        for dfn, dwt, dval in df:
                                            if dfn == 1 and dwt == 0:
                                                portnum = dval
                                            elif dfn == 2 and dwt == 2:
                                                payload = dval
                                        if portnum == 1 and payload:
                                            txt = payload.decode('utf-8', errors='replace')
                                            now_str = time.strftime('%H:%M:%S')
                                            if txt.startswith('EVW|MACK|'):
                                                mid = txt.split('|')[2].strip()
                                                dt = f"{int((time.time() - sent_times[mid]) * 1000)}ms" if mid in sent_times else "?"
                                                print(f"\n[{now_str}] << ACK RECEIVED ({dt}) from {from_id} RSSI={rssi} SNR={snr}: {txt}\n> ", end='', flush=True)
                                            elif txt.startswith('EVW|MSG|'):
                                                parts = txt.split('|')
                                                mid = parts[2] if len(parts) > 2 else ''
                                                print(f"\n[{now_str}] << CHAT RX from {from_id} RSSI={rssi} SNR={snr}: {txt}")
                                                if mid:
                                                    time.sleep(0.15)
                                                    send_frame(encode_text_toradio(f"EVW|MACK|{mid}"))
                                                    print(f"[{now_str}] >> Auto-sent EVW|MACK|{mid}\n> ", end='', flush=True)
                                            else:
                                                print(f"\n[{now_str}] << TEXT RX from {from_id} RSSI={rssi} SNR={snr}: {txt}\n> ", end='', flush=True)
                            continue
                        else:
                            break
                cursor += 1
            if cursor > 0:
                del buf[:cursor]

    threading.Thread(target=reader_loop, daemon=True).start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()

    try:
        while True:
            msg = input("> ").strip()
            if msg.lower() in ('quit', 'exit'):
                break
            if not msg:
                continue
            mid = str(int(time.time() * 1000))[-6:] + str(random.randint(10, 99))
            pkt = f"EVW|MSG|{mid}|Admin|PC Tester||{int(time.time())}|{msg}"
            sent_times[mid] = time.time()
            send_frame(encode_text_toradio(pkt))
            print(f"[{time.strftime('%H:%M:%S')}] >> TX ({len(pkt)}B): {pkt}  (waiting for EVW|MACK|{mid}...)")
    except KeyboardInterrupt:
        pass
    finally:
        stop_flag = True
        ser.close()
        print("\nClosed serial port. Goodbye!")

if __name__ == '__main__':
    main()
