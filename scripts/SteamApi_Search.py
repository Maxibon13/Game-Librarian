#!/usr/bin/env python3
"""
SteamApi_Search

Look up a game's Steam AppID by name and return a high-resolution header image URL.
Constructs the image URL in the format:
  https://cdn.steamstatic.com/steam/apps/{appid}/header.jpg

Intended fallback for Epic Games titles when local or Epic API thumbnails are unavailable.

CLI:
  python scripts/SteamApi_Search.py --game "Trackmania" [--debug]

Outputs JSON to stdout with keys:
  ok: bool
  game: str
  steamAppId: int | null
  imageUrl: str | null

If --debug is provided, also prints the four debug lines:
  [Game]: ...
  [SteamAppId]: ...
  [FoundImgSuccess]: true/false

No Steam API key required.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request


SEARCH_URL = "https://steamcommunity.com/actions/SearchApps/{}"
APPLIST_URL = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
APPDETAILS_URL = "https://store.steampowered.com/api/appdetails?appids={appid}"
STORE_SUGGEST_URL = (
    "https://store.steampowered.com/search/suggest?term={term}&f=games&cc=US&l=english"
)
APP_PAGE_URL = "https://steamcommunity.com/app/{appid}"
HEADER_URL_FMT = "https://cdn.steamstatic.com/steam/apps/{appid}/header.jpg"


def _http_get(url: str, timeout: float = 8.0, headers: dict | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        code = getattr(resp, "status", 200)
        data = resp.read()
        return code, data


def _normalize_name(name: str) -> str:
    s = name.casefold()
    s = s.replace("®", "").replace("™", "").replace("©", "")
    s = re.sub(r"[\u2122\u00AE\u00A9]", "", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def find_steam_appid(game_name: str) -> int | None:
    """Find a Steam appid by name using multiple strategies."""
    # Strategy 1: Steam Community SearchApps
    try:
        q = urllib.parse.quote(game_name)
        url = SEARCH_URL.format(q)
        code, data = _http_get(url)
        if code == 200:
            payload = json.loads(data.decode("utf-8", errors="replace"))
            if isinstance(payload, list) and payload:
                target = _normalize_name(game_name)
                for item in payload:
                    if not isinstance(item, dict):
                        continue
                    candidate = _normalize_name(str(item.get("name", "")))
                    if candidate == target:
                        return int(item.get("appid"))
                first = payload[0]
                if isinstance(first, dict) and "appid" in first:
                    return int(first.get("appid"))
    except Exception:
        pass

    # Strategy 2: Store suggest HTML (contains data-ds-appid)
    try:
        code_s, data_s = _http_get(STORE_SUGGEST_URL.format(term=urllib.parse.quote(game_name)))
        if code_s == 200 and data_s:
            html_s = data_s.decode("utf-8", errors="replace")
            m = re.search(r"data-ds-appid=\"(\d+)\"", html_s)
            if m:
                return int(m.group(1))
    except Exception:
        pass

    # Strategy 3: Full applist fuzzy match
    try:
        code, data = _http_get(APPLIST_URL)
        if code != 200:
            return None
        apps = json.loads(data.decode("utf-8", errors="replace")).get("applist", {}).get("apps", [])
        if not apps:
            return None
        target = _normalize_name(game_name)
        for app in apps:
            n = _normalize_name(str(app.get("name", "")))
            if n == target:
                return int(app.get("appid"))
        for app in apps:
            n = _normalize_name(str(app.get("name", "")))
            if n.startswith(target) or target.startswith(n):
                return int(app.get("appid"))
        for app in apps:
            n = _normalize_name(str(app.get("name", "")))
            if target in n or n in target:
                return int(app.get("appid"))
    except Exception:
        pass

    return None


def build_header_url(appid: int) -> str:
    return HEADER_URL_FMT.format(appid=appid)


def verify_image_url(url: str, timeout: float = 8.0) -> bool:
    try:
        code, _ = _http_get(url, timeout=timeout, headers={"Range": "bytes=0-16"})
        return 200 <= code < 400
    except Exception:
        return False


def resolve_thumbnail(game_name: str) -> dict:
    appid = find_steam_appid(game_name)
    if not appid:
        return {
            "ok": True,
            "game": game_name,
            "steamAppId": None,
            "imageUrl": None,
        }
    url = build_header_url(appid)
    found = verify_image_url(url)
    return {
        "ok": True,
        "game": game_name,
        "steamAppId": appid,
        "imageUrl": url if found else None,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Find Steam community thumbnail for a game name")
    parser.add_argument("--game", required=True, help="Game name to search on Steam (e.g., from Epic)")
    parser.add_argument("--debug", action="store_true", help="Print debug lines in addition to JSON output")
    args = parser.parse_args(argv)

    game_name = args.game.strip()
    result = resolve_thumbnail(game_name)

    if args.debug:
        print(f"[Game]: {game_name}")
        if result.get("steamAppId") is None:
            print("[SteamAppId]: Not found")
        else:
            print(f"[SteamAppId]: {result['steamAppId']}")
        # No hash for header.jpg
        print("[ImgHash]: Not found")
        print(f"[FoundImgSuccess]: {'true' if bool(result.get('imageUrl')) else 'false'}")

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))


