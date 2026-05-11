import asyncio
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

# Force stdout to UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

DEFAULT_BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\chrome-win\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
DEFAULT_PORT = 9880
DEFAULT_DEBUG_PORT = 9337
TEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_img")

PACK_ALIAS = {
    "pvpmen": "Pvpmen",
}


def normalize_pack_name(raw):
    # Strip " (2)" style counter suffixes and brackets; keep letters/digits/_
    s = re.sub(r"\s*\(\d+\)\s*$", "", raw).strip()
    s = s.replace("[", "").replace("]", "")
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-]", "", s)
    return s


def parse_test_images():
    tests = []
    for name in sorted(os.listdir(TEST_DIR)):
        m = re.match(r"^(Large|Small)\s*-\s*(.+)\.(png|jpe?g)$", name, re.I)
        if not m:
            continue
        scale = m.group(1).lower()
        expected = normalize_pack_name(m.group(2))
        low = expected.lower()
        if low in PACK_ALIAS:
            expected = PACK_ALIAS[low]
        tests.append((name, scale, expected))
    return tests


def parse_args():
    parser = argparse.ArgumentParser(description="Run SBI image matching regression tests.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--image", help="Run one test image by exact or case-insensitive substring match.")
    group.add_argument("--filter", help="Run test images whose filename matches this regex.")
    parser.add_argument("--fail-fast", action="store_true", help="Stop after the first failed test.")
    parser.add_argument("--quiet", action="store_true", help="Only print compact per-image results and summary.")
    parser.add_argument("--verbose", action="store_true", help="Print slot features and top-10 rows.")
    parser.add_argument("--no-timings", action="store_true", help="Hide per-image timing output.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="HTTP server port.")
    parser.add_argument("--debug-port", type=int, default=DEFAULT_DEBUG_PORT, help="Browser CDP port.")
    parser.add_argument("--browser", help="Browser executable path. Defaults to Chrome if available, then Edge.")
    parser.add_argument("--headless", default="--headless", help="Browser headless flag, e.g. --headless or --headless=new.")
    return parser.parse_args()


def filter_tests(tests, args):
    if args.image:
        needle = args.image.lower()
        exact = [test for test in tests if test[0].lower() == needle]
        return exact or [test for test in tests if needle in test[0].lower()]
    if args.filter:
        pattern = re.compile(args.filter, re.I)
        return [test for test in tests if pattern.search(test[0])]
    return tests


def fmt_seconds(value):
    return f"{value:.2f}s"


def resolve_browser_path(path):
    if path:
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Browser not found: {path}")
        return path
    for candidate in DEFAULT_BROWSER_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("No supported browser found. Pass --browser <path>.")


async def cdp_call(ws, method, params=None, recv_timeout=10, _counter=[0]):
    _counter[0] += 1
    msg_id = _counter[0]
    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=recv_timeout)
        resp = json.loads(raw)
        if resp.get("id") == msg_id:
            if "error" in resp:
                raise RuntimeError(resp["error"].get("message", "CDP error"))
            return resp.get("result", {})


async def cdp_eval(ws, expr, timeout=60):
    result = await cdp_call(ws, "Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": True,
        "timeout": timeout * 1000,
    }, recv_timeout=timeout + 5)
    val = result.get("result", {})
    if val.get("subtype") == "error":
        raise RuntimeError(val.get("description", "JS error"))
    return val.get("value")


async def wait_for(ws, js_expr, timeout=30):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        val = await cdp_eval(ws, js_expr, timeout=5)
        if val:
            return val
        await asyncio.sleep(0.3)
    raise TimeoutError(f"Timed out waiting for: {js_expr}")


def wait_for_http(url, timeout=10):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def fetch_cdp_json(debug_port, path):
    try:
        raw = urllib.request.urlopen(f"http://127.0.0.1:{debug_port}{path}", timeout=1).read()
        return json.loads(raw)
    except Exception:
        return None


def get_cdp_pages(debug_port):
    return fetch_cdp_json(debug_port, "/json/list") or []


def get_sbi_ws_url(debug_port):
    pages = get_cdp_pages(debug_port)
    if not pages:
        return None
    fallback = None
    for page in pages:
        if page.get("type") != "page" or not page.get("webSocketDebuggerUrl"):
            continue
        if not fallback:
            fallback = page["webSocketDebuggerUrl"]
        if "/sbi/" in page.get("url", ""):
            return page["webSocketDebuggerUrl"]
    return fallback


def match_name(expected, got):
    n = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    return n(expected) == n(got)


async def main():
    import websockets

    args = parse_args()
    base = f"http://127.0.0.1:{args.port}"
    sbi_url = f"{base}/sbi/"
    try:
        browser_path = resolve_browser_path(args.browser)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        return 1
    tests = filter_tests(parse_test_images(), args)
    if not tests:
        print("No test images found in", TEST_DIR)
        return 1

    print(f"Found {len(tests)} test image(s)\n", flush=True)
    suite_t0 = time.monotonic()

    # Start HTTP server
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(args.port), "--bind", "127.0.0.1"],
        cwd=os.path.dirname(os.path.abspath(__file__)),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not wait_for_http(sbi_url):
        print(f"ERROR: HTTP server did not become ready at {sbi_url}")
        server_proc.terminate()
        return 1

    # Start browser with remote debugging
    profile_dir = tempfile.mkdtemp(prefix="sbi-test-")
    edge_log_path = os.path.join(profile_dir, "edge.log")
    edge_log = open(edge_log_path, "w", encoding="utf-8", errors="replace")
    edge_proc = subprocess.Popen([
        browser_path,
        f"--remote-debugging-port={args.debug_port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-popup-blocking",
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--disable-software-rasterizer",
        "--disable-features=VizDisplayCompositor",
        "--use-angle=swiftshader",
        "--use-gl=swiftshader",
        args.headless,
        sbi_url,
    ], stdout=edge_log, stderr=edge_log)

    results = []
    try:
        # Wait for CDP
        ws_url = None
        for _ in range(60):
            ws_url = get_sbi_ws_url(args.debug_port)
            if ws_url:
                break
            await asyncio.sleep(0.5)

        if not ws_url:
            print("ERROR: Could not connect to browser CDP")
            if edge_proc.poll() is not None:
                print(f"Browser exited with code {edge_proc.returncode}")
            edge_log.flush()
            try:
                with open(edge_log_path, "r", encoding="utf-8", errors="replace") as fh:
                    lines = fh.readlines()[-20:]
                for line in lines:
                    print("  " + line.rstrip())
            except Exception:
                pass
            return 1

        ws = None
        for attempt in range(5):
            try:
                ws_url = get_sbi_ws_url(args.debug_port) or ws_url
                ws = await websockets.connect(ws_url, max_size=50_000_000, proxy=None)
                await cdp_call(ws, "Runtime.enable")
                await cdp_call(ws, "Page.enable")
                break
            except Exception:
                if ws:
                    await ws.close()
                ws = None
                if attempt == 4:
                    print("ERROR: Could not attach to browser CDP target")
                    edge_log.flush()
                    try:
                        with open(edge_log_path, "r", encoding="utf-8", errors="replace") as fh:
                            lines = fh.readlines()[-20:]
                        for line in lines:
                            print("  " + line.rstrip())
                    except Exception:
                        pass
                    return 1
                await asyncio.sleep(0.5)

        async with ws:
            # Wait for SBI page ready
            try:
                await wait_for(ws, "!!window.__sbiTest && !!document.getElementById('sbi-results')", timeout=30)
            except TimeoutError:
                state = await cdp_eval(ws, """
                    JSON.stringify({
                        href: location.href,
                        readyState: document.readyState,
                        hasResults: !!document.getElementById('sbi-results'),
                        hasHook: !!window.__sbiTest,
                    })
                """, timeout=5)
                print(f"DEBUG page state: {state}")
                return 1

            print("SBI page ready\n", flush=True)

            for img_name, preset, expected in tests:
                test_t0 = time.monotonic()
                try:
                    img_url = f"{base}/test_img/{urllib.parse.quote(img_name)}"
                    js_img_name = json.dumps(img_name)
                    js_preset = json.dumps(preset)
                    js_img_url = json.dumps(img_url)
                    js_detail = json.dumps("verbose" if args.verbose else "compact")
                    js = f"""
                    (async () => {{
                      const timings = {{}};
                      const t0 = performance.now();
                      const resp = await fetch({js_img_url});
                      if (!resp.ok) throw new Error("Fetch " + resp.status);
                      const blob = await resp.blob();
                      timings.fetch = performance.now() - t0;
                      const file = new File([blob], {js_img_name}, {{ type: blob.type }});
                      try {{
                        const p0 = performance.now();
                        await window.__sbiTest.processImage(file, {js_preset});
                        timings.process = performance.now() - p0;
                      }} catch(e) {{
                        return JSON.stringify({{ error: e.message || String(e) }});
                      }}
                      const errEl = document.querySelector('.sbi-no-results');
                      if (errEl) return JSON.stringify({{ error: errEl.textContent }});
                      const s = window.__sbiTest.getSummary({{ detail: {js_detail} }});
                      s.timings = Object.assign(timings, s.timings || {{}});
                      return JSON.stringify(s);
                    }})()
                    """
                    raw = await cdp_eval(ws, js, timeout=90)
                    summary = json.loads(raw) if isinstance(raw, str) else raw

                    if "error" in summary:
                        elapsed = time.monotonic() - test_t0
                        results.append((img_name, expected, f"ERROR: {summary['error']}", False, elapsed))
                        print(f"  [ERROR] {img_name}: {summary['error']} ({fmt_seconds(elapsed)})\n")
                        if args.fail_fast:
                            break
                        continue

                    ranked = summary.get("ranked", [])
                    debug = summary.get("debug", {})
                    timings = summary.get("timings", {})
                    top1 = ranked[0]["name"] if ranked else "(none)"
                    ok = match_name(expected, top1)
                    status = "PASS" if ok else "FAIL"
                    elapsed = time.monotonic() - test_t0
                    results.append((img_name, expected, top1, ok, elapsed))
                    def fmt_row(r):
                        parts = [f"{r['name']}={r['score']:.4f}"]
                        if r.get('slotComposite') is not None:
                            parts.append(f"slot={r['slotComposite']:.3f}")
                        pts = r.get('perTypeScores') or {}
                        if pts:
                            tparts = []
                            for k in ('DS', 'EP', 'HL', 'SK/GC'):
                                v = pts.get(k)
                                if v is not None:
                                    tparts.append(f"{k}={v:.2f}")
                            if tparts:
                                parts.append("(" + " ".join(tparts) + ")")
                        if r.get('criticalTypeScore') is not None:
                            parts.append(f"crit={r['criticalTypeScore']:.2f}")
                        if r.get('healthSim') is not None:
                            parts.append(f"HP={r['healthSim']:.2f}")
                        if r.get('hungerSim') is not None:
                            parts.append(f"Hu={r['hungerSim']:.2f}")
                        if r.get('armorSim') is not None:
                            parts.append(f"Ar={r['armorSim']:.2f}")
                        if r.get('widgetSim') is not None:
                            parts.append(f"wg={r['widgetSim']:.3f}")
                        if r.get('coverage') is not None:
                            parts.append(f"cov={r['coverage']:.2f}")
                        return "[" + " ".join(parts) + "]"
                    timing_parts = []
                    if not args.no_timings:
                        for key in ("fetch", "decode", "fingerprints", "extract", "food", "match", "process"):
                            value = timings.get(key)
                            if isinstance(value, (int, float)):
                                timing_parts.append(f"{key}={value / 1000:.2f}s")
                        timing_parts.append(f"total={fmt_seconds(elapsed)}")
                    timing_text = (" | " + ", ".join(timing_parts)) if timing_parts else ""

                    print(f"  [{status}] {img_name} -> {top1}{timing_text}")
                    if not args.quiet:
                        print(f"    Expected: {expected}")
                        if debug:
                            print(f"    Debug:    slots={debug.get('slotCount')}, hearts={debug.get('heartCount')}, hunger={debug.get('hungerCount')}, armor={debug.get('armorCount')}, ranked={debug.get('rankedCount')}")
                        print(f"    SlotTypes: {summary.get('slotTypes', '-')}")
                    if args.verbose:
                        sfs = summary.get('slotFeatures', [])
                        for sf in sfs:
                            if sf is None: continue
                            sig = sf.get('sig') or {}
                            print(f"    Slot[{sf['index']}]: act={sf.get('activity',0):.2f} var={sf.get('variance',0):.0f} n={sig.get('n','?')} cov={sig.get('coverage',0):.2f} lum={sig.get('meanLum',0):.0f} R={sig.get('meanR',0):.0f} G={sig.get('meanG',0):.0f} B={sig.get('meanB',0):.0f} redF={sig.get('redFrac',0):.3f} yF={sig.get('yellowFrac',0):.3f} blueF={sig.get('blueFrac',0):.3f}")
                        for r in ranked[:10]:
                            print(f"    #  {fmt_row(r)}")
                    if not ok:
                        for idx, r in enumerate(ranked):
                            if match_name(expected, r['name']):
                                print(f"    Expected@#{idx+1}: {fmt_row(r)}")
                                break
                        if args.fail_fast:
                            break
                    print()
                except Exception as e:
                    elapsed = time.monotonic() - test_t0
                    results.append((img_name, expected, f"ERROR: {e}", False, elapsed))
                    print(f"  [ERROR] {img_name}: {e} ({fmt_seconds(elapsed)})\n")
                    if args.fail_fast:
                        break

    finally:
        edge_proc.terminate()
        server_proc.terminate()
        try:
            edge_proc.wait(timeout=5)
        except Exception:
            edge_proc.kill()
        try:
            server_proc.wait(timeout=3)
        except Exception:
            server_proc.kill()
        await asyncio.sleep(0.5)
        try:
            edge_log.close()
        except Exception:
            pass
        shutil.rmtree(profile_dir, ignore_errors=True)

    # Summary
    passed = sum(1 for result in results if result[3])
    total = len(results)
    suite_elapsed = time.monotonic() - suite_t0
    print("=" * 50)
    print(f"Results: {passed}/{total} passed in {fmt_seconds(suite_elapsed)}")
    for name, expected, got, ok, elapsed in results:
        print(f"  {'PASS' if ok else 'FAIL'}: {name} -> {got} (expected {expected}, {fmt_seconds(elapsed)})")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
