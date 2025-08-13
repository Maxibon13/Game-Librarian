#!/usr/bin/env python3
"""
controller_detect.py

Windows-only game controller detector. Enumerates connected input devices via
PowerShell/WMI and classifies known vendors (Xbox/PlayStation/Nintendo/Valve/8BitDo/etc.).

Outputs JSON:
{
  "ok": true,
  "connected": true|false,
  "primaryType": "Xbox"|"PlayStation"|"Nintendo"|"Valve"|"8BitDo"|"Generic"|null,
  "devices": [
    {"name": "Xbox Wireless Controller", "instanceId": "HID\\VID_045E&PID_02FD...", "vendorId": "045E", "type": "Xbox"}
  ]
}
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys


def _run_powershell(cmd: str, timeout: float = 4.0) -> str:
    try:
        completed = subprocess.run(
            [
                'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                '-Command', cmd
            ],
            capture_output=True, text=True, timeout=timeout, encoding='utf-8', errors='replace'
        )
        if completed.returncode == 0:
            return completed.stdout.strip()
    except Exception:
        pass
    return ''


def _vid_to_type(vid: str) -> str:
    v = (vid or '').upper()
    # Known vendor IDs
    if v == '045E':
        return 'Xbox'  # Microsoft
    if v == '054C':
        return 'PlayStation'  # Sony (DualShock/DualSense)
    if v == '057E':
        return 'Nintendo'  # Nintendo (Switch Pro/Joy‑Con via adapters)
    if v == '28DE':
        return 'Valve'  # Steam Controller/Deck
    if v in {'2E24', '20D6', '2DC8'}:
        return '8BitDo'  # common 8BitDo USB/Bluetooth bridges
    if v in {'0E6F', '12BA', '24C6', '1BAD', '146B', '1532'}:
        return 'Generic'
    return 'Generic'


def _name_to_type(name: str) -> str:
    n = (name or '').lower()
    if 'xbox' in n or 'xinput' in n:
        return 'Xbox'
    if 'dualsense' in n or 'dualshock' in n or 'wireless controller' in n or 'playstation' in n:
        return 'PlayStation'
    if 'nintendo' in n or 'switch' in n or 'joy-con' in n or 'pro controller' in n:
        return 'Nintendo'
    if 'steam' in n:
        return 'Valve'
    return 'Generic'


def detect_devices() -> dict:
    if sys.platform != 'win32':
        return { 'ok': True, 'connected': False, 'primaryType': None, 'devices': [] }

    # Prefer Get-PnpDevice for HIDClass
    ps_cmd = (
        "try { "
        "Get-PnpDevice -Class 'HIDClass' -Status OK -ErrorAction Stop | "
        "Where-Object { $_.FriendlyName -match 'Controller|Gamepad|XInput|Xbox|Wireless Controller|DualSense|DualShock|Pro Controller|Nintendo' } | "
        "Select-Object FriendlyName, InstanceId | ConvertTo-Json -Depth 2 -Compress"
        " } catch { '' }"
    )
    raw = _run_powershell(ps_cmd)
    data = None
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                data = [data]
        except Exception:
            data = None

    # Fallback via Win32_PnPEntity if no data
    if not data:
        ps_cmd2 = (
            "try { Get-CimInstance Win32_PnPEntity | "
            "Where-Object { $_.Name -match 'Controller|Gamepad|XInput|Xbox|Wireless Controller|DualSense|DualShock|Pro Controller|Nintendo' } | "
            "Select-Object Name, PNPDeviceID | ConvertTo-Json -Depth 2 -Compress } catch { '' }"
        )
        raw2 = _run_powershell(ps_cmd2)
        if raw2:
            try:
                tmp = json.loads(raw2)
                if isinstance(tmp, dict):
                    tmp = [tmp]
                # Normalize to same shape
                data = [
                    { 'FriendlyName': item.get('Name') or '', 'InstanceId': item.get('PNPDeviceID') or '' }
                    for item in tmp if isinstance(item, dict)
                ]
            except Exception:
                data = None

    devices = []
    if isinstance(data, list):
        for item in data:
            try:
                name = str(item.get('FriendlyName') or '').strip()
                inst = str(item.get('InstanceId') or '').strip()
                m = re.search(r'VID_([0-9A-Fa-f]{4})', inst)
                vid = m.group(1).upper() if m else ''
                typ = _vid_to_type(vid)
                if typ == 'Generic':
                    typ = _name_to_type(name)
                # Avoid obvious false positives
                if not name and not inst:
                    continue
                devices.append({ 'name': name or 'Controller', 'instanceId': inst, 'vendorId': vid, 'type': typ })
            except Exception:
                continue

    connected = len(devices) > 0
    # Choose primary type by preference order
    primary = None
    pref = ['Xbox', 'PlayStation', 'Nintendo', 'Valve', '8BitDo', 'Generic']
    for p in pref:
        if any(d.get('type') == p for d in devices):
            primary = p
            break

    return { 'ok': True, 'connected': connected, 'primaryType': primary, 'devices': devices }


def main():
    try:
        print(json.dumps(detect_devices(), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({ 'ok': False, 'error': str(e) }))
        sys.exit(1)


if __name__ == '__main__':
    main()


