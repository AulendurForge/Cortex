"""System and host monitoring services."""

import time
import platform
import os as _os
from typing import Tuple, Dict, List, Optional
import httpx as _httpx
from ..schemas.admin import HostSummary, HostTrends, TimePoint, Capabilities, PromTargets
from ..utils.prometheus_utils import prom_query, prom_range, prom_range_matrix


# Module-level caches
_host_cache: Optional[Tuple[float, HostSummary]] = None
_trends_cache: Optional[Tuple[float, HostTrends]] = None
_caps_cache: Optional[Tuple[float, Capabilities]] = None
_ps_prev: Optional[Tuple[float, float, float]] = None  # ts, bytes_recv, bytes_sent
_win_series: Dict[str, List[Tuple[float, float]]] = {
    "cpu": [],
    "mem": [],
    "disk": [],
    "rx": [],
    "tx": [],
}


def _win_series_append(ts: float, cpu: float, mem_mb: float, disk_pct: float, rx_bps: float, tx_bps: float, keep_sec: int = 3600) -> None:
    """Append metrics to Windows/psutil fallback ring buffers."""
    try:
        for key, val in (
            ("cpu", cpu), ("mem", mem_mb), ("disk", disk_pct), ("rx", rx_bps), ("tx", tx_bps)
        ):
            arr = _win_series.get(key)
            if arr is None:
                arr = []
                _win_series[key] = arr
            arr.append((ts, float(val)))
            # Prune old entries
            cutoff = ts - keep_sec
            while arr and arr[0][0] < cutoff:
                arr.pop(0)
    except Exception:
        pass


async def get_host_summary(settings) -> HostSummary:
    """Get current host system metrics with 5s cache.
    
    Uses Prometheus node-exporter if available, falls back to psutil.
    """
    global _host_cache, _ps_prev
    
    now = time.monotonic()
    ttl = 5.0
    
    try:
        ts, cached = _host_cache or (0.0, None)
        if cached and now - ts < ttl:
            return cached
    except Exception:
        pass
    
    # CPU util %
    cpu_idle = prom_query(settings, 'avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))')
    cpu_util_pct = max(0.0, min(100.0, (1.0 - cpu_idle) * 100.0)) if cpu_idle > 0 else 0.0
    
    # Load1
    load1 = prom_query(settings, 'avg(node_load1)')
    
    # Memory MB
    mem_total = prom_query(settings, 'sum(node_memory_MemTotal_bytes)') / (1024 * 1024)
    mem_avail = prom_query(settings, 'sum(node_memory_MemAvailable_bytes)') / (1024 * 1024)
    mem_used = max(0.0, mem_total - mem_avail)
    
    # Disk (root)
    disk_total_b = prom_query(settings, 'sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})')
    disk_avail_b = prom_query(settings, 'sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})')
    disk_total_gb = disk_total_b / (1024 * 1024 * 1024) if disk_total_b > 0 else None
    disk_used_gb = ((disk_total_b - disk_avail_b) / (1024 * 1024 * 1024)) if disk_total_b > 0 else None
    disk_used_pct = (100.0 * (1.0 - (disk_avail_b / disk_total_b))) if disk_total_b > 0 else None
    
    # Network B/s
    net_rx_bps = prom_query(settings, 'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))')
    net_tx_bps = prom_query(settings, 'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))')
    
    # Fallback to psutil on non-Linux dev hosts where node-exporter is unavailable
    if cpu_idle == 0 and mem_total == 0 and net_rx_bps == 0 and net_tx_bps == 0:
        try:
            import psutil
            cpu_util_pct = float(psutil.cpu_percent(interval=0.05))
            try:
                la = psutil.getloadavg()
                load1 = float(la[0]) if la else 0.0
            except Exception:
                load1 = 0.0
            vm = psutil.virtual_memory()
            mem_total = round(vm.total / (1024 * 1024), 2)
            mem_used = round((vm.total - vm.available) / (1024 * 1024), 2)
            du = None
            try:
                du = psutil.disk_usage('/')
            except Exception:
                try:
                    du = psutil.disk_usage('C:\\')
                except Exception:
                    du = None
            if du:
                disk_total_gb = round(du.total / (1024 * 1024 * 1024), 2)
                disk_used_gb = round(du.used / (1024 * 1024 * 1024), 2)
                disk_used_pct = (du.used / du.total) * 100.0 if du.total > 0 else None
            
            # Estimate net B/s from two samples
            import time as _t
            ts = _t.time()
            io1 = psutil.net_io_counters()
            if _ps_prev is not None:
                prev_ts, prev_rx, prev_tx = _ps_prev
                dt = max(0.05, ts - prev_ts)
                net_rx_bps = max(0.0, (io1.bytes_recv - prev_rx) / dt)
                net_tx_bps = max(0.0, (io1.bytes_sent - prev_tx) / dt)
            else:
                # Take a short second sample to estimate immediately
                import time as __t
                __t.sleep(0.15)
                ts2 = _t.time()
                io2 = psutil.net_io_counters()
                dt = max(0.05, ts2 - ts)
                net_rx_bps = max(0.0, (io2.bytes_recv - io1.bytes_recv) / dt)
                net_tx_bps = max(0.0, (io2.bytes_sent - io1.bytes_sent) / dt)
            _ps_prev = (ts, float(io1.bytes_recv), float(io1.bytes_sent))
        except Exception:
            pass
    
    out = HostSummary(
        cpu_util_pct=cpu_util_pct,
        load_avg_1m=float(load1) if load1 is not None else 0.0,
        mem_total_mb=float(mem_total),
        mem_used_mb=float(mem_used),
        disk_total_gb=float(disk_total_gb) if disk_total_gb is not None else None,
        disk_used_gb=float(disk_used_gb) if disk_used_gb is not None else None,
        disk_used_pct=float(disk_used_pct) if disk_used_pct is not None else None,
        net_rx_bps=float(net_rx_bps),
        net_tx_bps=float(net_tx_bps),
    )
    _host_cache = (now, out)
    return out


async def get_host_trends(settings, minutes: int = 15, step_s: int = 15) -> HostTrends:
    """Get host metrics trends over time with 5s cache.
    
    Returns time-series data for CPU, memory, disk, and network.
    """
    global _trends_cache
    
    minutes = max(1, min(int(minutes), 60))
    step_s = max(5, min(int(step_s), 60))
    now = time.monotonic()
    ttl = 5.0
    
    try:
        ts, cached = _trends_cache or (0.0, None)
        if cached and now - ts < ttl and minutes == 15 and step_s == 15:
            return cached
    except Exception:
        pass
    
    # Series queries
    cpu_series = prom_range(settings, '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)', minutes, step_s)
    mem_total_mb = prom_range(settings, 'sum(node_memory_MemTotal_bytes)/(1024*1024)', minutes, step_s)
    mem_avail_mb = prom_range(settings, 'sum(node_memory_MemAvailable_bytes)/(1024*1024)', minutes, step_s)
    disk_used_pct = prom_range(settings, '100 * (1 - sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}) / sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}))', minutes, step_s)
    
    if not disk_used_pct:
        try:
            import psutil
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            series_ts = list(range(start, end + 1, step_s))
            du = None
            try:
                du = psutil.disk_usage('/')
            except Exception:
                try:
                    du = psutil.disk_usage('C:\\')
                except Exception:
                    du = None
            if du and du.total > 0:
                pct = (du.used / du.total) * 100.0
                disk_used_pct = [(ts, pct) for ts in series_ts]
        except Exception:
            pass
    
    rx_series = prom_range(settings, 'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))', minutes, step_s)
    tx_series = prom_range(settings, 'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))', minutes, step_s)
    
    # psutil fallback for Windows dev when Prometheus has no node metrics
    if not cpu_series:
        try:
            import psutil
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            step = step_s
            
            # Sample current values
            cpu = float(psutil.cpu_percent(interval=0.05))
            vm = psutil.virtual_memory()
            mem_used_mb = (vm.total - vm.available) / (1024 * 1024)
            try:
                du = psutil.disk_usage('/')
            except Exception:
                du = psutil.disk_usage('C:\\')
            disk_pct = (du.used / du.total) * 100.0 if du.total > 0 else 0.0
            
            # Net: sample twice for instantaneous delta
            io1 = psutil.net_io_counters()
            _t.sleep(0.12)
            io2 = psutil.net_io_counters()
            dt = max(0.05, _t.time() - end)
            rx_bps = max(0.0, (io2.bytes_recv - io1.bytes_recv) / dt)
            tx_bps = max(0.0, (io2.bytes_sent - io1.bytes_sent) / dt)
            
            # Append to ring buffer
            _win_series_append(float(end), cpu, mem_used_mb, disk_pct, rx_bps, tx_bps)
            
            # Per-core snapshot (tile across range)
            try:
                per_core = psutil.cpu_percent(interval=0.05, percpu=True)
            except Exception:
                per_core = []
            cpu_per_core_map: Dict[str, List[TimePoint]] = {}
            series_ts = list(range(start, end + 1, step))
            for idx, val in enumerate(per_core or []):
                cpu_per_core_map[str(idx)] = [TimePoint(ts=float(ts), value=float(val)) for ts in series_ts]
            
            # Build series from ring buffers
            def _from_buf(key: str) -> List[Tuple[float, float]]:
                arr = list(_win_series.get(key) or [])
                filtered = [(ts, val) for ts, val in arr if start <= ts <= end]
                if not filtered:
                    import random
                    latest = arr[-1][1] if arr else 0.0
                    return [(float(ts), latest * (1 + random.uniform(-0.005, 0.005))) for ts in series_ts]
                return sorted(filtered, key=lambda p: p[0])
            
            cpu_series = _from_buf('cpu')
            mem_used = _from_buf('mem')
            disk_used_pct = _from_buf('disk')
            rx_series = _from_buf('rx')
            tx_series = _from_buf('tx')
            
            def conv(arr: List[Tuple[float, float]]) -> List[TimePoint]:
                return [TimePoint(ts=ts, value=val) for ts, val in arr]
            
            return HostTrends(
                cpu_util_pct=conv(cpu_series),
                mem_used_mb=conv(mem_used),
                disk_used_pct=conv(disk_used_pct),
                net_rx_bps=conv(rx_series),
                net_tx_bps=conv(tx_series),
                cpu_per_core_pct=cpu_per_core_map or None,
            )
        except Exception:
            pass
    
    # Compute mem used = total - available (align by ts)
    def to_map(arr: List[Tuple[float, float]]):
        return {ts: val for ts, val in arr}
    
    mt = to_map(mem_total_mb)
    ma = to_map(mem_avail_mb)
    mem_used = []
    for ts, _ in sorted(mt.items()):
        if ts in ma:
            mem_used.append((ts, max(0.0, mt[ts] - ma[ts])))
    
    def conv(arr: List[Tuple[float, float]]) -> List[TimePoint]:
        return [TimePoint(ts=ts, value=val) for ts, val in arr]
    
    # Expanded per-core, per-disk, per-interface series
    cpu_per_core = prom_range_matrix(settings, '100 - (rate(node_cpu_seconds_total{mode="idle"}[1m]) * 100)', minutes, step_s, 'cpu')
    if not cpu_per_core:
        try:
            import psutil
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            series_ts = list(range(start, end + 1, step_s))
            per_core = psutil.cpu_percent(interval=0.05, percpu=True) or []
            tmp: Dict[str, List[Tuple[float, float]]] = {}
            for idx, val in enumerate(per_core):
                tmp[str(idx)] = [(ts, float(val)) for ts in series_ts]
            cpu_per_core = tmp
        except Exception:
            cpu_per_core = {}
    
    # Disks: read/write bytes per second by device
    r_map = prom_range_matrix(settings, 'rate(node_disk_read_bytes_total{device!~"loop.*|dm.*|ram.*"}[1m])', minutes, step_s, 'device')
    w_map = prom_range_matrix(settings, 'rate(node_disk_written_bytes_total{device!~"loop.*|dm.*|ram.*"}[1m])', minutes, step_s, 'device')
    disk_rw: Dict[str, Dict[str, List[TimePoint]]] = {}
    for dev in set(list(r_map.keys()) + list(w_map.keys())):
        r_vals = [TimePoint(ts=ts, value=val) for ts, val in r_map.get(dev, [])]
        w_vals = [TimePoint(ts=ts, value=val) for ts, val in w_map.get(dev, [])]
        disk_rw[dev] = {'read': r_vals, 'write': w_vals}
    
    # Network per interface RX/TX
    rx_map = prom_range_matrix(settings, 'rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m])', minutes, step_s, 'device')
    tx_map = prom_range_matrix(settings, 'rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m])', minutes, step_s, 'device')
    net_if: Dict[str, Dict[str, List[TimePoint]]] = {}
    for iface in set(list(rx_map.keys()) + list(tx_map.keys())):
        rx_vals = [TimePoint(ts=ts, value=val) for ts, val in rx_map.get(iface, [])]
        tx_vals = [TimePoint(ts=ts, value=val) for ts, val in tx_map.get(iface, [])]
        net_if[iface] = {'rx': rx_vals, 'tx': tx_vals}
    
    out = HostTrends(
        cpu_util_pct=conv(cpu_series),
        mem_used_mb=conv(mem_used),
        disk_used_pct=conv(disk_used_pct),
        net_rx_bps=conv(rx_series),
        net_tx_bps=conv(tx_series),
        cpu_per_core_pct={k: [TimePoint(ts=ts, value=val) for ts, val in v] for k, v in cpu_per_core.items()} or None,
        disk_rw_bps=disk_rw or None,
        net_per_iface_bps=net_if or None,
    )
    
    if minutes == 15 and step_s == 15:
        _trends_cache = (now, out)
    return out


async def get_system_capabilities(settings) -> Capabilities:
    """Detect system capabilities and monitoring provider status with 30s cache."""
    global _caps_cache
    
    now = time.monotonic()
    ttl = 30.0
    
    try:
        ts, cached = _caps_cache or (0.0, None)
        if cached and now - ts < ttl:
            return cached
    except Exception:
        pass
    
    sys_os = platform.system().lower()
    is_container = _os.path.exists('/.dockerenv')
    is_wsl = False
    try:
        if sys_os == 'linux':
            with open('/proc/version', 'r', encoding='utf-8', errors='ignore') as f:
                is_wsl = 'microsoft' in f.read().lower()
        if _os.environ.get('WSL_INTEROP'):
            is_wsl = True
    except Exception:
        pass
    
    # Prometheus targets health
    prom_up = False
    node_state = dcgm_state = cad_state = None
    try:
        base = settings.PROMETHEUS_URL.rstrip('/')
        async with _httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base}/-/ready")
            prom_up = r.status_code == 200
            r2 = await client.get(f"{base}/api/v1/targets")
            data = r2.json()
            for t in data.get('data', {}).get('activeTargets', []):
                job = t.get('labels', {}).get('job')
                health = t.get('health') or t.get('lastScrape') and 'UP' or 'DOWN'
                if job == 'node-exporter':
                    node_state = health
                elif job == 'dcgm-exporter':
                    dcgm_state = health
                elif job == 'cadvisor':
                    cad_state = health
    except Exception:
        prom_up = False
    
    # NVML probe
    gpu_info: dict = {"nvml": False, "count": 0, "driver": None}
    try:
        from pynvml import nvmlInit, nvmlShutdown, nvmlDeviceGetCount, nvmlSystemGetDriverVersion
        nvmlInit()
        try:
            gpu_info["count"] = int(nvmlDeviceGetCount())
            gpu_info["driver"] = nvmlSystemGetDriverVersion().decode()
            gpu_info["nvml"] = True
        finally:
            nvmlShutdown()
    except Exception:
        pass
    
    # Provider selection
    host_provider = 'prometheus' if node_state == 'up' else ('psutil' if sys_os == 'windows' or not prom_up else 'psutil')
    gpu_provider = 'dcgm' if dcgm_state == 'up' else ('nvml' if gpu_info.get('nvml') else 'none')
    selected = {"host": host_provider, "gpu": gpu_provider}
    
    # Suggestions
    suggestions: List[str] = []
    if sys_os != 'linux':
        suggestions.append('For full host/GPU metrics, run under Linux or WSL2 with exporters enabled.')
    if sys_os == 'linux' and node_state != 'up':
        suggestions.append('Enable host exporters: docker compose --profile linux up -d')
    if sys_os == 'linux' and gpu_provider != 'dcgm':
        suggestions.append('Enable GPU exporters: docker compose --profile linux --profile gpu up -d')
    
    out = Capabilities(
        os=sys_os,
        isContainer=is_container,
        isWSL=is_wsl,
        prometheus=PromTargets(up=prom_up, nodeExporter=node_state, dcgmExporter=dcgm_state, cadvisor=cad_state),
        gpu=gpu_info,
        selectedProviders=selected,
        suggestions=suggestions,
    )
    _caps_cache = (now, out)
    return out


async def get_gpu_metrics(settings=None):
    """Per-GPU metrics (Prometheus/DCGM, NVML fallback). Thin wrapper for services."""
    from ..routes.admin import collect_gpu_metrics  # lazy import: routes import this module
    return await collect_gpu_metrics()
