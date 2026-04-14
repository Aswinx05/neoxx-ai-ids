from scapy.all import sniff, IP, TCP, UDP
import requests
import json
import time
import threading
from collections import defaultdict

# Configuration
SERVER_URL = "http://127.0.0.1:3000/api/external-data"
FLOW_WINDOW = 5  # seconds

# Flow storage: (src, dst, proto) -> data
flows = defaultdict(lambda: {
    "start_time": time.time(),
    "last_time": time.time(),
    "src_bytes": 0,
    "dst_bytes": 0,
    "count": 0,
    "services": set()
})

def packet_callback(packet):
    if IP in packet:
        src_ip = packet[IP].src
        dst_ip = packet[IP].dst
        proto = packet[IP].proto
        size = len(packet)
        
        # Identify service (port)
        service = "other"
        if TCP in packet:
            service = str(packet[TCP].dport)
        elif UDP in packet:
            service = str(packet[UDP].dport)

        # Identify direction and update flow
        # Use a sorted tuple of IPs to make the flow bidirectional
        ips = sorted([src_ip, dst_ip])
        flow_key = (ips[0], ips[1], proto)
        flow = flows[flow_key]
        
        flow["last_time"] = time.time()
        flow["count"] += 1
        flow["services"].add(service)
        
        # Track bytes based on direction
        if src_ip == ips[0]:
            flow["src_bytes"] += size
        else:
            flow["dst_bytes"] += size

def export_flows():
    while True:
        time.sleep(FLOW_WINDOW)
        current_time = time.time()
        
        # Copy and clear flows for the next window
        global flows
        active_flows = flows.copy()
        flows = defaultdict(lambda: {
            "start_time": time.time(),
            "last_time": time.time(),
            "src_bytes": 0,
            "dst_bytes": 0,
            "count": 0,
            "services": set()
        })

        # Calculate srv_count (number of flows to the same service)
        service_counts = defaultdict(int)
        for (src, dst, proto), data in active_flows.items():
            # Extract port from services set (if any)
            for s in data["services"]:
                service_counts[s] += 1

        # Batch flows to send in a single request
        batch_payload = []
        for (src, dst, proto), data in active_flows.items():
            duration = data["last_time"] - data["start_time"]
            
            # Get the srv_count for the primary service of this flow
            # (Using the first service in the set as a heuristic)
            primary_service = list(data["services"])[0] if data["services"] else "other"
            srv_count = service_counts[primary_service]

            batch_payload.append({
                "src": src,
                "dst": dst,
                "proto": proto,
                "duration": round(duration, 2),
                "src_bytes": data["src_bytes"],
                "dst_bytes": data["dst_bytes"],
                "count": data["count"],
                "srv_count": srv_count,
                "type": "TCP" if proto == 6 else "UDP" if proto == 17 else "Other"
            })
        
        if batch_payload:
            try:
                # Send all flows in one batch request
                response = requests.post(SERVER_URL, json={"flows": batch_payload}, timeout=2)
                if response.status_code == 200:
                    print(f"[+] Batch Sent: {len(batch_payload)} flows exported.")
            except Exception as e:
                print(f"[-] Error sending batch: {e}")

def main():
    print(f"[*] Starting NEOXX.AI ML-Enhanced Sniffer...")
    print(f"[*] Aggregating flows every {FLOW_WINDOW} seconds")
    print(f"[*] Forwarding to {SERVER_URL}")
    
    # Start export thread
    threading.Thread(target=export_flows, daemon=True).start()
    
    try:
        sniff(prn=packet_callback, store=0)
    except PermissionError:
        print("[-] Error: Please run as Administrator/Root (sudo python sniffer.py)")

if __name__ == "__main__":
    main()
