"""IP utility functions for host IP detection and allowlist management."""

import os
import socket
from typing import Optional
from fastapi import Request


def get_host_ip() -> Optional[str]:
    """Get the host machine's IP address.
    
    Tries multiple methods:
    1. HOST_IP environment variable (set by Docker Compose/entrypoint)
    2. Detect from network interfaces (best-effort)
    
    Returns:
        Host IP address string, or None if detection fails
    """
    # Method 1: Check environment variable (set by entrypoint.sh)
    host_ip = os.environ.get("HOST_IP")
    if host_ip and host_ip not in ("localhost", "127.0.0.1"):
        return host_ip.strip()
    
    # Method 2: Try to detect from network interfaces
    try:
        # Connect to external address to determine local IP
        # This doesn't actually send data, just determines routing
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Connect to a public DNS server (doesn't actually connect)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            # Filter out loopback and Docker bridge networks
            if local_ip and local_ip != "127.0.0.1" and not local_ip.startswith("172.17."):
                return local_ip
        except Exception:
            s.close()
    except Exception:
        pass
    
    # Method 3: Try hostname resolution
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip and local_ip != "127.0.0.1":
            return local_ip
    except Exception:
        pass
    
    return None


def ensure_host_ip_in_allowlist(ip_allowlist: str) -> str:
    """Ensure host machine IP is included in the allowlist.
    
    If ip_allowlist is empty, returns empty string (allows all IPs).
    If ip_allowlist has values, adds host IP if not already present.
    
    Args:
        ip_allowlist: Comma-separated string of allowed IPs
        
    Returns:
        Updated allowlist string with host IP included
    """
    # If empty, return empty (allows all IPs)
    if not ip_allowlist or not ip_allowlist.strip():
        return ""
    
    # Get host IP
    host_ip = get_host_ip()
    if not host_ip:
        # If we can't detect host IP, return original allowlist
        return ip_allowlist
    
    # Parse existing allowlist
    existing_ips = [ip.strip() for ip in ip_allowlist.split(",") if ip.strip()]
    
    # Add host IP if not already present
    if host_ip not in existing_ips:
        existing_ips.append(host_ip)
    
    # Return comma-separated string
    return ",".join(existing_ips)


def parse_networks(raw: str) -> list["ipaddress.IPv4Network | ipaddress.IPv6Network"]:
    """Parse a comma-separated list of IPs / CIDR ranges; invalid entries are skipped."""
    import ipaddress
    out = []
    for item in (raw or "").split(","):
        item = item.strip()
        if not item:
            continue
        try:
            out.append(ipaddress.ip_network(item, strict=False))
        except ValueError:
            continue
    return out


def ip_in_networks(ip: Optional[str], networks) -> bool:
    import ipaddress
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    return any(addr in n for n in networks)


def validate_allowlist(raw: str) -> list[str]:
    """Return the invalid entries of an allowlist string (IPs or CIDRs)."""
    import ipaddress
    bad = []
    for item in (raw or "").split(","):
        item = item.strip()
        if not item:
            continue
        try:
            ipaddress.ip_network(item, strict=False)
        except ValueError:
            bad.append(item)
    return bad


def get_client_ip(request: Request) -> Optional[str]:
    """Client IP for allowlists and logs.

    ``X-Forwarded-For`` / ``X-Real-IP`` are honoured only when the direct peer is one of
    ``TRUSTED_PROXY_IPS``; otherwise anyone could bypass an IP allowlist by sending the header.
    """
    peer = request.client.host if request.client else None
    try:
        from ..config import get_settings
        trusted = parse_networks(get_settings().TRUSTED_PROXY_IPS)
    except Exception:
        trusted = []
    if trusted and ip_in_networks(peer, trusted):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            first_ip = forwarded_for.split(",")[0].strip()
            if first_ip:
                return first_ip
        real_ip = (request.headers.get("X-Real-IP") or "").strip()
        if real_ip:
            return real_ip
    return peer
