import sys
import meshtastic
import meshtastic.serial_interface

print("Scanning COM4...")
try:
    iface = meshtastic.serial_interface.SerialInterface('COM4')
    print("SUCCESS! Connected to node on COM4:")
    my_num = iface.myInfo.my_node_num
    print(f"My Node Num: {my_num} (Hex: !{my_num:08x})")
    
    node = iface.nodesByNum.get(my_num, {})
    user = node.get('user', {})
    print(f"Long Name:  {user.get('longName', 'N/A')}")
    print(f"Short Name: {user.get('shortName', 'N/A')}")
    print(f"Node ID:    {user.get('id', 'N/A')}")
    print(f"Hardware:   {user.get('hwModel', 'N/A')}")
    
    print("\n--- Mesh Nodes Known by this Node ---")
    for nnum, ndata in iface.nodesByNum.items():
        u = ndata.get('user', {})
        lname = u.get('longName', 'Unknown')
        sname = u.get('shortName', '?')
        nid = u.get('id', '?')
        lh = ndata.get('lastHeard', 'Never')
        snr = ndata.get('snr', 'N/A')
        print(f"  * {lname} [{sname}] ID: {nid} | Last Heard: {lh} | SNR: {snr}")
        
    iface.close()
except Exception as e:
    print(f"Error communicating with COM4: {e}")
