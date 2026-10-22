"""Actual mouse/pointer-lock regressions, including sandboxed drag fallback.

Requires the running game at HELIO_TEST_URL (default http://127.0.0.1:4173).
Uses native Playwright mouse/keyboard input; only a small QA physics advance is
used to verify that the flight heading matches the mouse view.
"""
import json
import math
import os
from pathlib import Path
import time
import traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-output'
URL = os.environ.get('HELIO_TEST_URL', 'http://127.0.0.1:4173')
OUTPUT.mkdir(exist_ok=True)


def main():
    started = time.monotonic()
    report = {'checks': [], 'page_errors': [], 'console_errors': [], 'expected_sandbox_errors': []}

    def check(name, details=None):
        report['checks'].append({'name': name, 'detail': details})
        print('PASS ' + name, flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 800, 'height': 600}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
        page.on('console', lambda m: report['console_errors'].append(m.text) if m.type == 'error' else None)
        page.set_default_timeout(30000)
        try:
            page.goto(URL+'/?qa=1', wait_until='networkidle')
            page.wait_for_selector('#menu:not(.hidden)')
            page.locator('#start').click()
            page.wait_for_function('window.__HELIO__.getState().view.locked')
            state = lambda: page.evaluate('window.__HELIO__.getState()')
            view = lambda: state()['view']
            check('Start captures the actual browser pointer lock')
            page.screenshot(path=str(OUTPUT/'camera-flight.png'))

            page.mouse.move(400, 300)
            baseline = view()
            page.mouse.move(540, 300, steps=4)
            moved = view()
            delta = (moved['yaw'] - baseline['yaw'] + math.pi) % (2*math.pi) - math.pi
            assert .25 < delta < .37, (baseline, moved, delta)
            check('Mouse right turns right, with stable per-pixel sensitivity', round(delta, 4))
            page.wait_for_function('''() => {const v=window.__HELIO__.getState().view;
                const actual=Math.atan2(v.direction[0],-v.direction[2]);
                return Math.abs(Math.atan2(Math.sin(actual-v.yaw),Math.cos(actual-v.yaw)))<1e-6;}''')
            rendered = view()
            assert abs(math.dist(rendered['position'],rendered['anchor'])-11.6)<1e-5
            check('Rendered yaw follows input without an angular spring; orbit remains 11.6 units')

            page.evaluate('window.__HELIO__.qa.setYaw(0)')
            page.mouse.move(680, 300, steps=4)
            before = state()['player']
            page.keyboard.down('w')
            page.evaluate('for(let t=0;t<.7;t+=1/120)window.__HELIO__.qa.step(1/120)')
            page.keyboard.up('w')
            assert state()['player'][0] > before[0]+.7
            check('Forward flight follows the same rightward mouse heading')

            before = view()
            page.mouse.move(680, 160, steps=4)
            after = view()
            assert after['pitch'] > before['pitch']+.25, (before, after)
            page.wait_for_function(f'window.__HELIO__.getState().view.direction[1] > {before["direction"][1]} + .1')
            check('Mouse up looks up on a real vertical axis')
            page.mouse.move(680, -2500, steps=4)
            assert abs(view()['pitch']-1.05)<1e-8, view()
            page.mouse.move(680, 3000, steps=4)
            assert abs(view()['pitch']+1.05)<1e-8, view()
            page.wait_for_function('Math.abs(Math.hypot(...window.__HELIO__.getState().view.position.map((n,i)=>n-window.__HELIO__.getState().view.anchor[i]))-11.6)<1e-5')
            check('Vertical look clamps safely without flipping or changing orbit radius')

            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().view.locked')
            paused = view()
            page.mouse.move(300, 250, steps=3)
            page.wait_for_timeout(350)
            assert state()['mode']=='pause'
            assert view()['yaw']==paused['yaw'] and view()['pitch']==paused['pitch']
            check('Escape releases the cursor, pauses once, and paused mouse motion is ignored')
            page.locator('#look-sensitivity').focus()
            page.keyboard.press('Home')
            page.locator('#look-invert').check()
            assert view()['sensitivity']==.4 and view()['inverted'] is True
            assert page.locator('#look-sensitivity-value').evaluate('el=>el.value')=='0,4×'
            page.screenshot(path=str(OUTPUT/'camera-settings.png'))
            check('Pause exposes keyboard-accessible sensitivity and vertical inversion controls')

            for _ in range(2):
                page.locator('#resume').click()
                page.wait_for_function('window.__HELIO__.getState().view.locked')
                page.keyboard.press('Escape')
                page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().view.locked')
            check('Repeated Resume and Escape cycles recapture and release cleanly')
            page.reload(wait_until='networkidle')
            page.wait_for_selector('#menu:not(.hidden)')
            assert view()['sensitivity']==.4 and view()['inverted'] is True
            check('Sensitivity and inversion persist across a reload')
            page.locator('#start').click()
            page.wait_for_function('window.__HELIO__.getState().view.locked')
            page.mouse.move(400,300)
            before=view()
            page.mouse.move(500,200,steps=4)
            after=view()
            dyaw=(after['yaw']-before['yaw']+math.pi)%(2*math.pi)-math.pi
            assert abs(dyaw-.088)<.01, (before,after)
            assert after['pitch'] < before['pitch']-.07
            check('Lower sensitivity changes angular travel and inverted up motion looks down')
            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause"')
            context.close()

            # The iframe deliberately omits allow-pointer-lock. A denied native
            # request must leave ordinary dragging functional, without JS errors.
            fallback_context=browser.new_context(viewport={'width':800,'height':600})
            fallback_page=fallback_context.new_page()
            fallback_page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
            def fallback_console(message):
                if message.type!='error':return
                text=message.text
                if 'pointer lock' in text.lower() and 'sandbox' in text.lower():
                    report['expected_sandbox_errors'].append(text)
                else:report['console_errors'].append(text)
            fallback_page.on('console',fallback_console)
            fallback_page.set_content(f'<style>body{{margin:0}}iframe{{border:0;width:800px;height:600px}}</style><iframe sandbox="allow-scripts allow-same-origin" src="{URL}/?qa=1"></iframe>')
            frame=fallback_page.frame_locator('iframe')
            frame.locator('#menu:not(.hidden)').wait_for(timeout=60000)
            frame.locator('#start').click()
            inner=fallback_page.frames[1]
            fallback_state=lambda:inner.evaluate('window.__HELIO__.getState()')
            inner.wait_for_function('document.getElementById("look-hint").textContent.includes("MAINTENIR")')
            assert fallback_state()['mode']=='play' and not fallback_state()['view']['locked']
            check('Sandbox denial is recoverable and advertises drag fallback')
            fallback_page.mouse.move(350,300)
            before=fallback_state()['view']
            fallback_page.mouse.down()
            fallback_page.mouse.move(490,240,steps=4)
            fallback_page.mouse.up()
            after=fallback_state()['view']
            assert after['yaw']>before['yaw']+.25 and after['pitch']>before['pitch']+.08,(before,after)
            check('Fallback dragging preserves conventional horizontal and vertical directions')
            before=fallback_state()['view']
            fallback_page.mouse.move(600,400,steps=4)
            after=fallback_state()['view']
            assert after['yaw']==before['yaw'] and after['pitch']==before['pitch']
            check('Releasing a fallback drag stops rotation')

            fallback_page.mouse.move(350,300)
            inner.evaluate('document.getElementById("game").addEventListener("pointerdown", e=>window.__testPointerId=e.pointerId,{once:true})')
            fallback_page.mouse.down()
            fallback_page.mouse.move(400,300)
            inner.evaluate('document.getElementById("game").dispatchEvent(new PointerEvent("pointercancel",{pointerId:window.__testPointerId,bubbles:true}))')
            before=fallback_state()['view']
            fallback_page.mouse.move(500,350)
            after=fallback_state()['view']
            fallback_page.mouse.up()
            assert before['yaw']==after['yaw'] and before['pitch']==after['pitch']
            check('Pointer cancellation clears fallback drag state')

            fallback_page.mouse.move(350,300)
            inner.evaluate('document.getElementById("game").addEventListener("pointerdown", e=>window.__testPointerId=e.pointerId,{once:true})')
            fallback_page.mouse.down()
            fallback_page.mouse.move(400,300)
            inner.evaluate('document.getElementById("game").releasePointerCapture(window.__testPointerId)')
            before=fallback_state()['view']
            fallback_page.mouse.move(500,350)
            after=fallback_state()['view']
            fallback_page.mouse.up()
            assert before['yaw']==after['yaw'] and before['pitch']==after['pitch']
            check('Lost pointer capture clears fallback drag state')
            fallback_context.close()
            assert not report['page_errors'],report['page_errors']
            assert not report['console_errors'],report['console_errors']
            check('No uncaught JavaScript or unexpected console errors')
            report['passed']=True
        except Exception as error:
            report['passed']=False
            report['failure']=str(error)
            report['traceback']=traceback.format_exc()
            print(report['traceback'],flush=True)
            raise
        finally:
            report['wall_seconds']=round(time.monotonic()-started,2)
            (OUTPUT/'camera-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            browser.close()
    print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'wall_seconds':report['wall_seconds']}),flush=True)


if __name__=='__main__':
    main()
