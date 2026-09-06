#!/usr/bin/env python3
"""Dependency-free, loopback-only HTTP tool for cs2-sandbox."""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("本地 API 不应重定向，请从 AI 技能页面复制当前连接。")


def call(connection, payload=None):
    parts = urlsplit(connection.strip())
    if (parts.scheme != "http" or parts.hostname != "127.0.0.1"
            or not parts.port or parts.username or parts.password or parts.query
            or parts.path not in ("", "/") or not re.fullmatch(r"[a-f0-9]{64}", parts.fragment)):
        raise ValueError("连接格式应为 http://127.0.0.1:<port>/#<token>，请从 AI 技能页面复制。")
    endpoint = "/api/library" if payload is None else "/api/skills/grenades"
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(f"http://127.0.0.1:{parts.port}{endpoint}", data=body,
                  headers={"X-Local-Token": parts.fragment, "Content-Type": "application/json"})
    # Do not forward local credentials to proxy servers or redirects.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=300) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection-file", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--request-file", type=Path)
    mode.add_argument("--list", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        payload = None if args.list else json.loads(args.request_file.read_text(encoding="utf-8-sig"))
        if not args.list and not isinstance(payload, dict):
            raise ValueError("请求必须是 JSON 对象")
        result = call(args.connection_file.read_text(encoding="utf-8-sig"), payload)
        output = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            args.output.write_text(output + "\n", encoding="utf-8")
            print(f"结果已保存：{args.output}")
        else:
            print(output)
        return 0
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {detail}", file=sys.stderr)
    except (OSError, ValueError, URLError) as exc:
        print(f"无法分析：{exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
