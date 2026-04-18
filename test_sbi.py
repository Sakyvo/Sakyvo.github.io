import asyncio
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

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9876
DEBUG_PORT = 9333
BASE = f"http://127.0.0.1:{PORT}"
SBI_URL = f"{BASE}/sbi/"
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


async def cdp_call(ws, method, params=None, _counter=[0]):
    _counter[0] += 1
    msg_id = _counter[0]
    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    while True:
        raw = await ws.recv()
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
    })
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


def match_name(expected, got):
    n = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    return n(expected) == n(got)


async def main():
    import websockets

    tests = parse_test_images()
    if not tests:
        print("No test images found in", TEST_DIR)
        return 1

    print(f"Found {len(tests)} test image(s)\n")

    # Start HTTP server
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=os.path.dirname(os.path.abspath(__file__)),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    await asyncio.sleep(0.5)

    # Start Edge with remote debugging
    profile_dir = tempfile.mkdtemp(prefix="sbi-test-")
    edge_proc = subprocess.Popen([
        EDGE,
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-popup-blocking",
        "--headless=new",
        SBI_URL,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    results = []
    try:
        # Wait for CDP
        ws_url = None
        for _ in range(60):
            try:
                raw = urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2).read()
                pages = json.loads(raw)
                for p in pages:
                    if p.get("type") == "page" and p.get("webSocketDebuggerUrl"):
                        ws_url = p["webSocketDebuggerUrl"]
                        break
            except Exception:
                pass
            if ws_url:
                break
            await asyncio.sleep(0.5)

        if not ws_url:
            print("ERROR: Could not connect to Edge CDP")
            return 1

        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            await cdp_call(ws, "Runtime.enable")
            await cdp_call(ws, "Page.enable")

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

            # Pre-load fingerprints
            print("Loading fingerprints...")
            await cdp_eval(ws, f"""
                (async () => {{
                    const resp = await fetch('/data/sbi-fingerprints.json?v=10');
                    if (!resp.ok) throw new Error('Failed to load fingerprints: ' + resp.status);
                    // Store globally so processImage can find them
                    return 'OK: ' + resp.status;
                }})()
            """, timeout=30)
            print("SBI page ready\n")

            for img_name, preset, expected in tests:
                try:
                    img_url = f"{BASE}/test_img/{urllib.parse.quote(img_name)}"
                    js = f"""
                    (async () => {{
                      const resp = await fetch("{img_url}");
                      if (!resp.ok) throw new Error("Fetch " + resp.status);
                      const blob = await resp.blob();
                      const file = new File([blob], "{img_name}", {{ type: blob.type }});
                      try {{
                        await window.__sbiTest.processImage(file, "{preset}");
                      }} catch(e) {{
                        return JSON.stringify({{ error: e.message || String(e) }});
                      }}
                      const errEl = document.querySelector('.sbi-no-results');
                      if (errEl) return JSON.stringify({{ error: errEl.textContent }});
                      const s = window.__sbiTest.getSummary();
                      return JSON.stringify(s);
                    }})()
                    """
                    raw = await cdp_eval(ws, js, timeout=90)
                    summary = json.loads(raw) if isinstance(raw, str) else raw

                    if "error" in summary:
                        results.append((img_name, expected, f"ERROR: {summary['error']}", False))
                        print(f"  [ERROR] {img_name}: {summary['error']}\n")
                        continue

                    ranked = summary.get("ranked", [])
                    debug = summary.get("debug", {})
                    top1 = ranked[0]["name"] if ranked else "(none)"
                    ok = match_name(expected, top1)
                    status = "PASS" if ok else "FAIL"
                    results.append((img_name, expected, top1, ok))
                    def fmt_row(r):
                        parts = [f"{r['name']}={r['score']:.4f}"]
                        if r.get('slotComposite') is not None:
                            parts.append(f"slot={r['slotComposite']:.3f}")
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
                    print(f"  [{status}] {img_name}")
                    print(f"    Expected: {expected}")
                    print(f"    Got #1:   {top1}")
                    if debug:
                        print(f"    Debug:    slots={debug.get('slotCount')}, hearts={debug.get('heartCount')}, hunger={debug.get('hungerCount')}, armor={debug.get('armorCount')}, ranked={debug.get('rankedCount')}")
                    print(f"    SlotTypes: {summary.get('slotTypes', '-')}")
                    # Print slot features for deep debugging
                    sfs = summary.get('slotFeatures', [])
                    for sf in sfs:
                        if sf is None: continue
                        sig = sf.get('sig') or {}
                        print(f"    Slot[{sf['index']}]: act={sf.get('activity',0):.2f} var={sf.get('variance',0):.0f} n={sig.get('n','?')} cov={sig.get('coverage',0):.2f} lum={sig.get('meanLum',0):.0f} R={sig.get('meanR',0):.0f} G={sig.get('meanG',0):.0f} B={sig.get('meanB',0):.0f} redF={sig.get('redFrac',0):.3f} yF={sig.get('yellowFrac',0):.3f} blueF={sig.get('blueFrac',0):.3f}")
                    for r in ranked[:10]:
                        print(f"    #  {fmt_row(r)}")
                    if not ok:
                        # find expected pack info
                        for idx, r in enumerate(ranked):
                            if match_name(expected, r['name']):
                                print(f"    Expected@#{idx+1}: {fmt_row(r)}")
                                break
                    print()
                except Exception as e:
                    results.append((img_name, expected, f"ERROR: {e}", False))
                    print(f"  [ERROR] {img_name}: {e}\n")

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
        shutil.rmtree(profile_dir, ignore_errors=True)

    # Summary
    passed = sum(1 for *_, ok in results if ok)
    total = len(results)
    print("=" * 50)
    print(f"Results: {passed}/{total} passed")
    for name, expected, got, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}: {name} -> {got} (expected {expected})")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
