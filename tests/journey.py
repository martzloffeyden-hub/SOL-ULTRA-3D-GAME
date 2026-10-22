"""Continuous HÉLIO journey using only movement inputs and real game physics.

Start a local server, then run ``python tests/journey.py``. Playwright and a local
Chromium binary are required. HELIO_TEST_URL overrides http://127.0.0.1:4173.

The localhost QA hook advances the existing physics at 120 Hz. No player/seed
placement, phase setter, chapter loader, interaction hook or completion-counter
mutation is used. The route controller sends the same key events as a player.
Actual start/transition/replay buttons and E/X keypresses drive progression.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import time
import traceback

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-output"
URL = os.environ.get("HELIO_TEST_URL", "http://127.0.0.1:4173")

DRIVER = r"""() => {
  const game = window.__HELIO__;
  // This test cannot accidentally use the QA positioning/phase/progression API.
  for (const name of Object.keys(game.qa)) if (name !== 'step') delete game.qa[name];
  const held = new Set();
  const codes = ['KeyW','KeyS','KeyA','KeyD','Space','KeyC','KeyF'];
  let simulated = 0, maxTether = 0, pathLength = 0, maxStep = 0;
  function setKeys(wanted) {
    for (const code of codes) {
      if (wanted.has(code) === held.has(code)) continue;
      window.dispatchEvent(new KeyboardEvent(wanted.has(code) ? 'keydown' : 'keyup', {
        code, key: code === 'Space' ? ' ' : code.replace('Key','').toLowerCase(),
        bubbles: true, cancelable: true
      }));
      if (wanted.has(code)) held.add(code); else held.delete(code);
    }
  }
  window.__journeyDriver = {
    release: () => setKeys(new Set()),
    steer: ({target, gateIndex=null, timeout=18, folded=false}) => {
      const initial = game.getState();
      const steps = Math.ceil(timeout * 120);
      let minimumDistance = Infinity;
      for (let i=0; i<steps; i++) {
        const s = game.getState();
        if (s.mode !== 'play') throw new Error('Unexpected mode during flight: '+s.mode);
        const error = target.map((value,axis) => value - s.player[axis]);
        const distance = Math.hypot(...error);
        minimumDistance = Math.min(minimumDistance, distance);
        if (s.carrying) maxTether = Math.max(maxTether, Math.hypot(...s.seed.map((value,axis) => value-s.player[axis])));
        if ((gateIndex !== null && s.gateIndex > gateIndex) ||
            (gateIndex === null && distance < .6 && Math.hypot(...s.velocity) < 1.3)) {
          setKeys(new Set());
          return {ok:true, state:s, seconds:i/120, minimumDistance, simulated, maxTether, pathLength, maxStep};
        }
        const aim = error.map((value,axis) => value - s.velocity[axis] * .29);
        const wanted = new Set(folded ? ['KeyF'] : []);
        const tolerance = .18;
        if (aim[0] > tolerance) wanted.add('KeyD');
        else if (aim[0] < -tolerance) wanted.add('KeyA');
        if (aim[1] > tolerance) wanted.add('Space');
        else if (aim[1] < -tolerance) wanted.add('KeyC');
        if (aim[2] > tolerance) wanted.add('KeyS');
        else if (aim[2] < -tolerance) wanted.add('KeyW');
        setKeys(wanted);
        game.qa.step(1/120);
        const next = game.getState();
        const delta = Math.hypot(...next.player.map((value,axis) => value-s.player[axis]));
        pathLength += delta;
        maxStep = Math.max(maxStep, delta);
        simulated += 1/120;
      }
      setKeys(new Set());
      return {ok:false, initial, target, gateIndex, state:game.getState(), minimumDistance, simulated, maxTether, pathLength, maxStep};
    }
  };
}"""


def main():
    OUTPUT.mkdir(exist_ok=True)
    report = {"url": URL, "qa_hooks_used": ["step"], "teleports": 0,
              "checks": [], "page_errors": [], "console_errors": []}
    started = time.monotonic()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"])
        page = browser.new_page(viewport={"width": 800, "height": 600}, device_scale_factor=1)
        page.set_default_timeout(60000)
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
        page.on("console", lambda message: report["console_errors"].append(message.text) if message.type == "error" else None)

        def state():
            return page.evaluate("window.__HELIO__.getState()")

        def check(name, detail=None):
            report["checks"].append({"name": name, "detail": detail})
            print("PASS " + name + (": " + str(detail) if detail is not None else ""), flush=True)

        def steer(target, gate_index=None, folded=False):
            result = page.evaluate("args=>window.__journeyDriver.steer(args)",
                {"target": target, "gateIndex": gate_index, "folded": folded})
            assert result["ok"], result
            report["simulated_seconds"] = round(result["simulated"], 3)
            report["max_tether_during_flight"] = round(result["maxTether"], 3)
            report["continuous_path_meters"] = round(result["pathLength"], 3)
            report["largest_physics_step_meters"] = round(result["maxStep"], 4)
            return result["state"]

        try:
            response = page.goto(URL + "/?qa=1", wait_until="networkidle")
            assert response.status == 200
            page.wait_for_function("window.__HELIO__?.qa && !document.getElementById('menu').classList.contains('hidden')")
            page.locator("#start").click()
            assert state()["mode"] == "play"
            page.evaluate(DRIVER)
            levels = page.evaluate("window.__HELIO__.levels")
            check("start through user interface; only QA step remains available")

            gate_total = 0
            for ci, level in enumerate(levels):
                assert state()["chapter"] == ci
                steer(level["seed"])
                page.keyboard.press("e")
                assert state()["carrying"] is True
                check(f"chapter {ci+1}: continuously fly to seed and collect with E")
                for gi, gate in enumerate(level["gates"]):
                    if gate["phase"] is not None and state()["phase"] != gate["phase"]:
                        page.keyboard.press("x")
                    assert gate["phase"] is None or state()["phase"] == gate["phase"]
                    # A reachable front approach and an exit beyond the aperture
                    # provide one uninterrupted flight line for the trailing seed.
                    approach = [gate["pos"][i] + gate["normal"][i]*4.5 for i in range(3)]
                    exit_point = [gate["pos"][i] - gate["normal"][i]*5.5 for i in range(3)]
                    steer(approach, folded=True)
                    crossed = steer(exit_point, gate_index=gi, folded=True)
                    gate_total += 1
                    assert crossed["gateIndex"] == gi+1
                    assert crossed["totalGates"] == gate_total
                    check(f"chapter {ci+1}, ring {gi+1}: continuous seed passage", {
                        "position": [round(v,2) for v in crossed["player"]],
                        "impacts": crossed["impacts"]})
                steer(level["altar"], folded=True)
                assert state()["interactReady"] is True
                page.keyboard.press("e")
                if ci < len(levels)-1:
                    assert state()["mode"] == "chapter"
                    page.locator("#next").click()
                    assert state()["mode"] == "play" and state()["chapter"] == ci+1
                    check(f"chapter {ci+1}: deliver and transition using real UI")
                else:
                    final = state()
                    assert final["mode"] == "won" and final["totalGates"] == 12
                    report["victory"] = final
                    page.screenshot(path=str(OUTPUT / "journey-victory.png"))
                    check("continuous 12-ring, 3-garden journey reaches victory", {
                        "game_seconds": round(final["elapsed"],2), "impacts": final["impacts"]})
            page.locator("#replay").click()
            replay = state()
            assert replay["mode"] == "play" and replay["chapter"] == 0
            assert replay["gateIndex"] == replay["totalGates"] == replay["impacts"] == 0
            assert replay["carrying"] is False
            check("replay returns to a clean initial journey")
            assert not report["page_errors"], report["page_errors"]
            assert not report["console_errors"], report["console_errors"]
            check("no uncaught JavaScript or console errors")
            report["passed"] = True
        except Exception as error:
            report["passed"] = False
            report["failure"] = str(error)
            report["traceback"] = traceback.format_exc()
            try:
                report["failure_state"] = state()
                page.screenshot(path=str(OUTPUT / "journey-failure.png"))
            except Exception:
                pass
            print(report["traceback"], flush=True)
        finally:
            try:
                page.evaluate("window.__journeyDriver?.release()")
            except Exception:
                pass
            browser.close()
            report["wall_seconds"] = round(time.monotonic()-started, 2)
            (OUTPUT / "journey-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({"passed":report["passed"],"checks":len(report["checks"]),
                              "wall_seconds":report["wall_seconds"]}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
