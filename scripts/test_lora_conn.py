import meshtastic.serial_interface

try:
    print("Testing connection to COM3...")
    iface = meshtastic.serial_interface.SerialInterface(devPath="COM3")
    print("Connected successfully!")
    print("Nodes:", len(iface.nodes))
    iface.close()
except Exception as e:
    print("Error:", type(e), e)
