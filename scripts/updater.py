import sys
import os
import json
import time
import urllib.request
import urllib.error
import ssl
import tempfile
import re


def _parse_owner_repo(repo_url: str):
    try:
        if repo_url.endswith('.git'):
            repo_url = repo_url[:-4]
        if repo_url.startswith('git@github.com:'):
            path = repo_url.split(':', 1)[1]
            parts = path.strip('/').split('/')
            if len(parts) >= 2:
                return parts[0], parts[1]
        if 'github.com/' in repo_url:
            path = repo_url.split('github.com/', 1)[1]
            parts = path.strip('/').split('/')
            if len(parts) >= 2:
                return parts[0], parts[1]
    except Exception:
        pass
    return None, None


def _http_get(url: str, headers=None, timeout=10):
    headers = headers or {}
    req = urllib.request.Request(url, headers={
        'User-Agent': headers.get('User-Agent', 'GameLibrarian-Updater/1.0 (+https://github.com/Maxibon13/Game-Librarian)')
    })
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


def _compare_semver(a: str, b: str) -> int:
    def to_nums(v):
        return [int(x) if x.isdigit() else 0 for x in str(v or '0').split('.')[:4]]
    a1, a2, a3, *resta = to_nums(a) + [0, 0, 0]
    b1, b2, b3, *restb = to_nums(b) + [0, 0, 0]
    if a1 != b1:
        return a1 - b1
    if a2 != b2:
        return a2 - b2
    return a3 - b3


def _extract_version_from_release(data: dict) -> str:
    tag = (data or {}).get('tag_name') or (data or {}).get('name') or ''
    m = re.search(r'(\d+\.\d+\.\d+)', tag)
    return m.group(1) if m else ''


def action_check(options: dict):
    repo_url = options.get('repository') or options.get('repo') or 'https://github.com/Maxibon13/Game-Librarian'
    local_version = options.get('localVersion') or '0.0.0'
    owner, repo = _parse_owner_repo(repo_url)
    if not owner or not repo:
        return { 'ok': False, 'error': 'invalid_repository' }

    # Try GitHub Releases first
    releases_api = f'https://api.github.com/repos/{owner}/{repo}/releases/latest'
    remote_version = ''
    source = ''
    assets = []
    try:
        raw = _http_get(releases_api)
        j = json.loads(raw.decode('utf-8', errors='ignore'))
        if isinstance(j, dict):
            remote_version = _extract_version_from_release(j) or ''
            assets = [ { 'name': a.get('name'), 'size': a.get('size'), 'browser_download_url': a.get('browser_download_url') } for a in (j.get('assets') or []) ]
            source = 'releases'
    except Exception:
        pass

    # Fallback to package.json in main branch if no releases or no semver tag
    if not remote_version:
        try:
            raw_pkg = _http_get(f'https://raw.githubusercontent.com/{owner}/{repo}/main/package.json')
            pkg = json.loads(raw_pkg.decode('utf-8', errors='ignore'))
            if isinstance(pkg, dict) and pkg.get('version'):
                remote_version = str(pkg.get('version'))
                source = 'package.json'
        except Exception:
            pass

    if not remote_version:
        return { 'ok': False, 'error': 'remote_version_not_found' }

    cmp = _compare_semver(remote_version, local_version)
    return {
        'ok': True,
        'updateAvailable': bool(cmp > 0 and options.get('canUpdate', True)),
        'localVersion': local_version,
        'remoteVersion': remote_version,
        'source': source,
        'assets': assets,
        'ts': time.time(),
        'repository': repo_url
    }


def action_info(options: dict):
    repo_url = options.get('repository') or 'https://github.com/Maxibon13/Game-Librarian'
    owner, repo = _parse_owner_repo(repo_url)
    if not owner or not repo:
        return { 'ok': False, 'error': 'invalid_repository' }
    try:
        raw = _http_get(f'https://api.github.com/repos/{owner}/{repo}')
        j = json.loads(raw.decode('utf-8', errors='ignore'))
        return { 'ok': True, 'repo': j }
    except Exception as e:
        return { 'ok': False, 'error': str(e) }


def action_download_asset(options: dict):
    url = options.get('url') or options.get('browser_download_url')
    if not url:
        return { 'ok': False, 'error': 'missing_url' }
    try:
        data = _http_get(url)
        fd, tmp = tempfile.mkstemp(prefix='gamelibrarian_', suffix='_' + os.path.basename(url))
        os.close(fd)
        with open(tmp, 'wb') as f:
            f.write(data)
        return { 'ok': True, 'path': tmp, 'size': len(data) }
    except Exception as e:
        return { 'ok': False, 'error': str(e) }


def main():
    try:
        action = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
        raw = sys.argv[2] if len(sys.argv) > 2 else '{}'
        try:
            options = json.loads(raw)
        except Exception:
            options = {}

        if action == 'check':
            print(json.dumps(action_check(options)))
        elif action == 'info':
            print(json.dumps(action_info(options)))
        elif action == 'download-asset':
            print(json.dumps(action_download_asset(options)))
        else:
            print(json.dumps({ 'ok': False, 'error': 'unknown_action', 'hint': 'use check|info|download-asset' }))
    except Exception as e:
        print(json.dumps({ 'ok': False, 'error': str(e) }))
        sys.exit(1)


if __name__ == '__main__':
    main()


