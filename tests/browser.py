"""Browser regression checks for HÉLIO.

Run against a running local HTTP server: python tests/browser.py
Optional: HELIO_TEST_URL=http://127.0.0.1:4173 python tests/browser.py

Keyboard events exercise movement and interactions. The localhost-only QA hook
positions a run near each challenge and advances the same simulation; it never
sets completion counters. This is accelerated traversal, not a manual playthrough.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import time
import traceback

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-output"
URL = os.environ.get("HELIO_TEST_URL", "http://127.0.0.1:4173")
OUTPUT.mkdir(exist_ok=True)


def distance(a, b):
    return math.dist(a, b)


def main():
    report = {"url": URL, "viewport": [1440, 900], "checks": [], "console_errors": [], "page_errors": [], "http_errors": []}
    started = time.monotonic()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.set_default_timeout(30000)
        page.on("console", lambda message: report["console_errors"].append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
        page.on("response", lambda response: report["http_errors"].append({"status": response.status, "url": response.url}) if response.status >= 400 else None)

        def state():
            return page.evaluate("window.__HELIO__.getState()")

        def wait_play():
            page.wait_for_function("()=>{const state=window.__HELIO__?.getState();return state?.mode==='play'&&!state.menu.transitioning;}")

        def progress(snapshot):
            return {key: snapshot[key] for key in ["chapter", "gateIndex", "totalGates", "carrying", "phase", "elapsed", "player", "checkpoint"]}

        def qa(method, value=None):
            return page.evaluate("([method,value])=>window.__HELIO__.qa[method](value)", [method, value])

        def simulate(seconds):
            # Fixed 120 Hz simulation preserves continuous gate/collision checks.
            return page.evaluate("seconds=>{for(let t=0;t<seconds-1e-8;t+=1/120)window.__HELIO__.qa.step(Math.min(1/120,seconds-t));return window.__HELIO__.getState()}", seconds)

        def check(name, detail=None):
            report["checks"].append({"name": name, "detail": detail})
            print(f"PASS {name}" + (f": {detail}" if detail is not None else ""), flush=True)

        def release_all():
            for key in ["w", "a", "s", "d", "Space", "c", "f", "Shift", "ArrowLeft", "ArrowRight"]:
                page.keyboard.up(key)

        try:
            response = page.goto(URL + "/?qa=1", wait_until="networkidle", timeout=60000)
            assert response.status == 200
            page.wait_for_function("window.__HELIO__?.qa && !document.getElementById('menu').classList.contains('hidden')", timeout=60000)
            assert page.locator("#fatal").evaluate("el=>el.classList.contains('hidden')")
            assert state()["mode"] == "menu"
            page.screenshot(path=str(OUTPUT / "01-menu.png"))
            check("load, WebGL initialization and menu")

            page.locator("#start").click()
            wait_play()
            assert state()["mode"] == "play"
            before = state()["player"]
            page.keyboard.down("w")
            after = simulate(.75)["player"]
            page.keyboard.up("w")
            assert after[2] < before[2] - 3, (before, after)
            check("W forward movement", round(before[2] - after[2], 2))

            qa("setPosition", [0, 7, 16])
            qa("setYaw", 0)
            before = state()["player"]
            page.keyboard.down("a")
            after = simulate(.75)["player"]
            page.keyboard.up("a")
            assert after[0] < before[0] - 3
            check("A lateral movement", round(before[0] - after[0], 2))

            qa("setPosition", [0, 7, 16])
            qa("setYaw", 0)
            page.keyboard.down("ArrowLeft")
            simulate(.7)
            page.keyboard.up("ArrowLeft")
            page.keyboard.down("w")
            turned = simulate(.75)["player"]
            page.keyboard.up("w")
            assert turned[0] < -2, turned
            check("left arrow turns flight heading left")

            qa("setPosition", [0, 7, 16])
            page.mouse.move(600, 400)
            qa("setYaw", 0)
            page.mouse.down()
            page.mouse.move(950, 400, steps=7)
            page.mouse.up()
            page.keyboard.down("w")
            turned = simulate(.75)["player"]
            page.keyboard.up("w")
            assert turned[0] > 2, turned
            check("mouse look turns flight heading right", {"pointerLock": state()["view"]["locked"]})

            qa("setPosition", [0, 7, 16])
            qa("setYaw", 0)
            before = state()["player"]
            page.keyboard.down("Space")
            after = simulate(.75)["player"]
            page.keyboard.up("Space")
            assert after[1] > before[1] + 3
            page.keyboard.down("c")
            descended = simulate(1)["player"]
            page.keyboard.up("c")
            assert descended[1] < after[1] - 3
            check("Space ascent and C descent")

            # Right-hand terrace cap is at y=2.5. The drone has a 0.6 radius;
            # unlike the lower central island, this cannot pass via the world floor.
            qa("setPosition", [26, 2.65, -19])
            on_terrace = simulate(.1)
            assert on_terrace["player"][1] >= 3.099, on_terrace
            assert on_terrace["impacts"] == 0
            check("floating island cap collision keeps the drone above its surface")

            qa("setPosition", [0, 7, 16])
            page.keyboard.down("w")
            normal_distance = distance(simulate(.75)["player"], [0, 7, 16])
            page.keyboard.up("w")
            qa("setPosition", [0, 7, 16])
            page.keyboard.down("w")
            page.keyboard.down("Shift")
            boost_distance = distance(simulate(.75)["player"], [0, 7, 16])
            page.keyboard.up("Shift")
            page.keyboard.up("w")
            assert boost_distance > normal_distance * 1.5
            check("Shift boost", {"normal": round(normal_distance, 2), "boost": round(boost_distance, 2)})

            qa("setPosition", [0, 7, 9])
            page.keyboard.press("e")
            assert state()["carrying"] is True
            qa("setSeed", [0, 7, 12])
            page.keyboard.down("w")
            simulate(1)
            page.keyboard.up("w")
            loose = state()
            page.keyboard.down("f")
            simulate(1)
            page.keyboard.up("f")
            tight = state()
            assert distance(tight["player"], tight["seed"]) < distance(loose["player"], loose["seed"])
            check("E pickup and F tether compression")

            page.keyboard.press("Escape")
            assert state()["mode"] == "pause"
            page.wait_for_function("document.pointerLockElement === null")
            page.keyboard.press("Escape")
            assert state()["mode"] == "pause"
            paused = state()
            page.keyboard.down("w")
            page.wait_for_timeout(400)
            page.keyboard.up("w")
            assert state()["player"] == paused["player"]
            assert state()["elapsed"] == paused["elapsed"]
            assert progress(state()) == progress(paused), "The 3D pause menu changed journey progression"
            page.locator("#resume").click()
            wait_play()
            assert state()["mode"] == "play"
            check("Escape releases mouse and freezes simulation; Resume returns to flight")

            # Restart resets the counter potentially advanced during movement checks.
            page.keyboard.press("Escape")
            page.locator("#restart").click()
            wait_play()
            assert state()["chapter"] == state()["gateIndex"] == state()["totalGates"] == 0
            assert state()["carrying"] is False
            levels = page.evaluate("window.__HELIO__.levels")

            for ci, level in enumerate(levels):
                assert state()["chapter"] == ci
                qa("setPosition", level["seed"])
                page.keyboard.press("e")
                assert state()["carrying"] is True

                # Collision response must eject the player and retain progression.
                if ci == 0:
                    hazard = level["hazards"][0]
                    impacts_before = state()["impacts"]
                    qa("setPosition", hazard["pos"])
                    collided = simulate(.025)
                    assert collided["impacts"] == impacts_before + 1
                    assert distance(collided["player"], hazard["pos"]) >= hazard["radius"] + .59
                    page.keyboard.press("r")
                    assert distance(state()["player"], state()["checkpoint"]) < .02
                    assert state()["carrying"] is True
                    check("thorn collision ejects; R restores checkpoint and seed")

                for gi, gate in enumerate(level["gates"]):
                    n, center = gate["normal"], gate["pos"]

                    def position_approach():
                        qa("setPosition", [center[i] + n[i] * 4 for i in range(3)])
                        qa("setSeed", [center[i] + n[i] * 5 for i in range(3)])
                        qa("setYaw", math.atan2(-n[0], n[2]))

                    position_approach()
                    if ci == 1 and gi == 0:
                        qa("setPhase", 1 - gate["phase"])
                        page.keyboard.down("w")
                        wrong = simulate(2)
                        page.keyboard.up("w")
                        assert wrong["gateIndex"] == gi
                        signed = sum((wrong["player"][i] - center[i]) * n[i] for i in range(3))
                        assert signed > 0, wrong
                        check("wrong resonance blocks player and completion", round(signed, 3))
                        position_approach()

                    if gate["phase"] is not None:
                        if state()["phase"] != gate["phase"]:
                            page.keyboard.press("x")
                        assert state()["phase"] == gate["phase"]

                    # Guide the actual tether across the aperture with real keys.
                    # Vertical input is closed-loop to preserve the gate-center line.
                    page.keyboard.down("w")
                    vertical = None
                    for tick in range(60):
                        current = state()
                        if current["gateIndex"] > gi:
                            break
                        difference = center[1] - current["player"][1]
                        needed = "Space" if difference > .35 else "c" if difference < -.35 else None
                        if needed != vertical:
                            if vertical:
                                page.keyboard.up(vertical)
                            if needed:
                                page.keyboard.down(needed)
                            vertical = needed
                        simulate(.05)
                    page.keyboard.up("w")
                    if vertical:
                        page.keyboard.up(vertical)
                    actual = state()
                    assert actual["gateIndex"] == gi + 1, {"chapter": ci, "gate": gi, "state": actual}
                    assert actual["totalGates"] == sum(len(l["gates"]) for l in levels[:ci]) + gi + 1
                    check(f"chapter {ci + 1} gate {gi + 1}: seed crossed using flight physics")

                    if ci == 0 and gi == 0:
                        checkpoint = actual["checkpoint"]
                        qa("setPosition", [30, 30, 30])
                        page.keyboard.press("r")
                        assert distance(state()["player"], checkpoint) < .02
                        assert state()["gateIndex"] == 1
                        page.screenshot(path=str(OUTPUT / "02-flight.png"))
                        check("completed gate checkpoint retains progression")

                qa("setPosition", level["altar"])
                simulate(.01)
                assert state()["interactReady"]
                page.keyboard.press("e")
                assert state()["carrying"] is False
                if ci < 2:
                    assert state()["mode"] == "chapter"
                    completed_chapter = progress(state())
                    page.wait_for_function("document.pointerLockElement === null")
                    assert state()["view"]["locked"] is False
                    page.wait_for_timeout(150)
                    assert state()["mode"] == "chapter", "Asynchronous mouse unlock replaced the chapter screen"
                    assert progress(state()) == completed_chapter, "The 3D chapter menu changed journey progression"
                    page.screenshot(path=str(OUTPUT / f"03-chapter-{ci + 1}.png"))
                    page.locator("#next").click()
                    wait_play()
                    assert state()["mode"] == "play"
                    assert state()["chapter"] == ci + 1
                    assert state()["gateIndex"] == 0
                    check(f"chapter {ci + 1} delivery and transition")

                    # Opening the menu must not overwrite the stored later chapter.
                    assert page.evaluate("localStorage.getItem('helio-chapter')") == str(ci + 1)
                    page.reload(wait_until="networkidle")
                    page.wait_for_function("window.__HELIO__?.qa && !document.getElementById('menu').classList.contains('hidden')")
                    assert page.evaluate("localStorage.getItem('helio-chapter')") == str(ci + 1)
                    assert page.locator("#continue").is_visible()
                    page.locator("#continue").click()
                    wait_play()
                    resumed = state()
                    assert resumed["mode"] == "play" and resumed["chapter"] == ci + 1
                    assert resumed["gateIndex"] == 0 and resumed["carrying"] is False
                    assert resumed["totalGates"] == sum(len(l["gates"]) for l in levels[:ci + 1])
                    check(f"saved chapter {ci + 2} survives reload and Continue resumes it")
                else:
                    assert state()["mode"] == "won"
                    completed_journey = progress(state())
                    page.wait_for_function("document.pointerLockElement === null")
                    assert state()["view"]["locked"] is False
                    page.wait_for_timeout(150)
                    assert state()["mode"] == "won", "Asynchronous mouse unlock replaced the victory screen"
                    assert progress(state()) == completed_journey, "The 3D victory menu changed journey progression"
                    assert state()["totalGates"] == 12
                    assert "12" in page.locator("#stats").inner_text()
                    page.screenshot(path=str(OUTPUT / "04-victory.png"))
                    check("final delivery, victory screen and 12-gate score")

            page.locator("#replay").click()
            wait_play()
            replay = state()
            assert replay["mode"] == "play" and replay["chapter"] == 0
            assert replay["gateIndex"] == replay["totalGates"] == replay["impacts"] == 0
            assert replay["carrying"] is False
            page.screenshot(path=str(OUTPUT / "05-replay.png"))
            check("Replay resets the complete journey")

            page.wait_for_timeout(4000)
            report["rendering"] = page.evaluate("""async()=>{
                const times=[];const start=performance.now();
                await new Promise(resolve=>{function sample(now){times.push(now);if(now-start>=5000)resolve();else requestAnimationFrame(sample);}requestAnimationFrame(sample);});
                const gl=document.getElementById('game').getContext('webgl2');
                const ext=gl.getExtension('WEBGL_debug_renderer_info');
                return {viewport:[innerWidth,innerHeight],drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],warmupSeconds:4,frames:times.length,seconds:(times.at(-1)-start)/1000,observedFPS:times.length/((times.at(-1)-start)/1000),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),telemetry:window.__HELIO__.getState()};
            }""")
            check("software renderer FPS sampled", round(report["rendering"]["observedFPS"], 1))

            page.set_viewport_size({"width": 1024, "height": 768})
            page.wait_for_timeout(300)
            assert page.locator("#fatal").evaluate("el=>el.classList.contains('hidden')")
            page.screenshot(path=str(OUTPUT / "06-1024x768.png"))
            check("1024×768 viewport resize")

            assert not report["page_errors"], report["page_errors"]
            assert not report["console_errors"], report["console_errors"]
            assert not report["http_errors"], report["http_errors"]
            check("no uncaught JavaScript, console errors or failed HTTP responses")
            report["passed"] = True
        except Exception as error:
            report["passed"] = False
            report["failure"] = str(error)
            report["traceback"] = traceback.format_exc()
            try:
                report["failure_state"] = state()
                page.screenshot(path=str(OUTPUT / "failure.png"))
            except Exception:
                pass
            print(report["traceback"], flush=True)
        finally:
            release_all()
            browser.close()
            report["wall_seconds"] = round(time.monotonic() - started, 2)
            (OUTPUT / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(json.dumps({"passed": report["passed"], "checks": len(report["checks"]), "wall_seconds": report["wall_seconds"], "report": str(OUTPUT / "browser-report.json")}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
