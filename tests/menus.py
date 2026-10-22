"""Browser QA for HÉLIO's projected 3D menus and suspended journeys.

Requires a running local server. Set HELIO_TEST_URL to override localhost:4173.
All navigation uses real pointer/keyboard events. Local QA placement and normal
physics are used only to prepare a non-trivial journey for suspension checks.
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
    report = {'checks': [], 'page_errors': [], 'console_errors': [], 'http_errors': [], 'layouts': []}

    def check(name, details=None):
        report['checks'].append({'name': name, 'detail': details})
        print('PASS ' + name, flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'])

        def prepare_page(context):
            page = context.new_page()
            page.set_default_timeout(30000)
            page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
            page.on('console', lambda m: report['console_errors'].append(m.text) if m.type == 'error' else None)
            page.on('response', lambda r: report['http_errors'].append({'status':r.status,'url':r.url}) if r.status >= 400 else None)
            return page

        def state(page):
            return page.evaluate('window.__HELIO__.getState()')

        def menu_ready(page):
            page.wait_for_function('''() => {
                const s=window.__HELIO__?.getState();
                return s?.mode==='menu' && !s.menu.section && !s.menu.transitioning && s.menu.title3D && s.menu.drawCalls>0;
            }''', timeout=60000)
            page.wait_for_selector('#menu:not(.hidden)')

        def play_ready(page):
            page.wait_for_function('''() => {
                const s=window.__HELIO__?.getState();
                return s?.mode==='play' && !s.menu.transitioning;
            }''', timeout=60000)
            page.wait_for_function('window.__HELIO__.getState().view.locked', timeout=10000)

        def click_world(page, identity):
            # Animated world-projected controls need a real hit at their current
            # center, rather than Playwright's static-element stability heuristic.
            box = page.locator('#'+identity).bounding_box()
            assert box and box['width']>0 and box['height']>0, identity
            page.mouse.click(box['x']+box['width']/2, box['y']+box['height']/2)

        def layout(page, label, expected_continue):
            menu_ready(page)
            rectangles = page.evaluate('''() => [...document.querySelectorAll('#menu-navigation button:not(.hidden)')].map(el=>{
                const r=el.getBoundingClientRect();
                return {id:el.id,x:r.x,y:r.y,width:r.width,height:r.height,transform:getComputedStyle(el).transform};
            })''')
            identities=[r['id'] for r in rectangles]
            assert ('continue' in identities)==expected_continue, identities
            assert len(rectangles)==(4 if expected_continue else 3), identities
            viewport=page.viewport_size
            for r in rectangles:
                assert r['width']>100 and r['height']>20, r
                assert r['x']>=-1 and r['y']>=-1 and r['x']+r['width']<=viewport['width']+1 and r['y']+r['height']<=viewport['height']+1, (viewport,r)
                assert r['transform'].startswith('matrix3d('),r
            for index,a in enumerate(rectangles):
                for b in rectangles[index+1:]:
                    overlap_x=min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x'])
                    overlap_y=min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y'])
                    assert overlap_x<=0 or overlap_y<=0,(a,b)
            report['layouts'].append({'label':label,'viewport':viewport,'buttons':rectangles})
            check('Projected controls are visible, separated and within '+label)

        def set_resume_observer(page):
            page.evaluate('''() => {
                delete window.__menuResumeSnapshot;
                const observer=new MutationObserver(()=>{
                    const s=window.__HELIO__.getState();
                    if(s.mode==='play') { window.__menuResumeSnapshot=s; observer.disconnect(); }
                });
                observer.observe(document.getElementById('hud'),{attributes:true,attributeFilter:['class']});
            }''')

        def compare_journey(before, after):
            for field in ['player','seed','velocity','checkpoint','chapter','gateIndex','phase','carrying','elapsed','totalGates','impacts']:
                assert before[field]==after[field],(field,before[field],after[field])

        def simulate(page,seconds):
            return page.evaluate('''seconds=>{
                for(let t=0;t<seconds-1e-8;t+=1/120)window.__HELIO__.qa.step(Math.min(1/120,seconds-t));
                return window.__HELIO__.getState();
            }''',seconds)

        context=browser.new_context(viewport={'width':800,'height':600},device_scale_factor=1)
        page=prepare_page(context)
        try:
            page.goto(URL+'/?qa=1',wait_until='networkidle')
            menu_ready(page)
            assert state(page)['menu']['title3D'] is True
            assert page.locator('#menu h1').count()==1
            check('The initial menu renders the real 3D title and exposes its semantic heading')
            layout(page,'800x600 without a saved journey',False)
            page.set_viewport_size({'width':1440,'height':900})
            layout(page,'1440x900 without a saved journey',False)
            page.set_viewport_size({'width':1200,'height':750})
            menu_ready(page)
            page.screenshot(path=str(OUTPUT/'menus-main-1200x750.png'))
            page.set_viewport_size({'width':800,'height':600})
            menu_ready(page)

            page.locator('#start').focus()
            page.keyboard.press('Tab')
            assert page.evaluate('document.activeElement.id')=='menu-settings'
            page.keyboard.press('ArrowDown')
            assert page.evaluate('document.activeElement.id')=='menu-guide'
            page.keyboard.press('ArrowUp')
            assert page.evaluate('document.activeElement.id')=='menu-settings'
            page.keyboard.press('Enter')
            page.wait_for_function('window.__HELIO__.getState().menu.section === "settings"')
            assert state(page)['mode']=='menu'
            assert page.locator('#settings-camera-slot #camera-settings').count()==1
            assert page.locator('#look-sensitivity').is_visible()
            check('Projected menu buttons support Tab, arrow navigation and Enter activation')

            page.locator('#look-sensitivity').focus()
            page.keyboard.press('Home')
            page.locator('#look-invert').check()
            assert state(page)['view']['sensitivity']==.4 and state(page)['view']['inverted'] is True
            assert page.locator('#look-sensitivity-value').evaluate('el=>el.value')=='0,4×'
            page.locator('#menu-audio-toggle').click()
            assert page.locator('#menu-audio-toggle').get_attribute('aria-pressed')=='false'
            assert page.evaluate('localStorage.getItem("helio-muted")')=='1'
            page.locator('#menu-reduced-motion').check()
            assert state(page)['menu']['reducedMotion'] is True
            assert page.evaluate('localStorage.getItem("helio-menu-motion")')=='1'
            check('Main-menu settings control camera, sound and reduced animation state')

            page.locator('#menu-fullscreen').click()
            page.wait_for_function('document.fullscreenElement !== null || document.getElementById("menu-fullscreen").textContent.includes("Indisponible")')
            fullscreen=page.evaluate('!!document.fullscreenElement')
            if fullscreen:
                page.wait_for_function('document.getElementById("menu-fullscreen").textContent.includes("Réduire")')
                page.locator('#menu-fullscreen').click()
                page.wait_for_function('!document.fullscreenElement')
            report['fullscreen_available']=fullscreen
            check('Fullscreen enters and exits when supported, or reports unavailable safely',fullscreen)
            page.locator('#reset-look').click()
            assert state(page)['view']['sensitivity']==1 and state(page)['view']['inverted'] is False
            check('Reset view restores both camera settings')
            page.locator('#look-sensitivity').focus()
            page.keyboard.press('Home')
            page.keyboard.press('ArrowRight')
            page.locator('#look-invert').check()
            assert state(page)['view']['sensitivity']==.5
            page.set_viewport_size({'width':1200,'height':750})
            page.screenshot(path=str(OUTPUT/'menus-settings-1200x750.png'))
            page.keyboard.press('Escape')
            menu_ready(page)
            assert page.locator('#pause-quick-settings #camera-settings').count()==1
            assert not page.locator('#menu-panel').is_visible()
            check('Escape returns from settings without a stale or duplicated settings panel')

            click_world(page,'menu-guide')
            page.wait_for_function('window.__HELIO__.getState().menu.section === "guide"')
            assert page.locator('#guide-content').is_visible()
            guide=page.locator('#guide-content').inner_text()
            assert 'Espace' in guide or 'ESPACE' in guide,guide
            assert page.locator('#panel-back').is_visible()
            page.keyboard.press('Escape')
            menu_ready(page)
            check('Flight guide is reachable from the world menu and closes with Escape')

            page.reload(wait_until='networkidle')
            menu_ready(page)
            assert state(page)['view']['sensitivity']==.5 and state(page)['view']['inverted'] is True
            assert state(page)['menu']['reducedMotion'] is True
            click_world(page,'menu-settings')
            page.wait_for_function('window.__HELIO__.getState().menu.section === "settings"')
            assert page.locator('#menu-audio-toggle').get_attribute('aria-pressed')=='false'
            assert page.locator('#menu-reduced-motion').is_checked()
            page.locator('#panel-back').click()
            menu_ready(page)
            check('Camera, audio and reduced-motion preferences survive a reload')

            # Exercise delayed (animated) launch as well as immediate reduced-motion
            # navigation. This must retain genuine pointer-lock user activation.
            click_world(page,'menu-settings')
            page.wait_for_function('window.__HELIO__.getState().menu.section === "settings"')
            page.locator('#menu-reduced-motion').uncheck()
            page.locator('#reset-look').click()
            page.locator('#panel-back').click()
            menu_ready(page)
            click_world(page,'start')
            play_ready(page)
            assert not state(page)['menu']['suspended'] and not state(page)['menu']['section']
            check('Animated Start transition enters flight and captures the actual mouse')

            # Prepare one genuinely completed gate without changing any counters.
            page.evaluate('window.__HELIO__.qa.setPosition([0,7,9])')
            page.keyboard.press('e')
            assert state(page)['carrying'] is True
            page.evaluate('window.__HELIO__.qa.setPosition([0,7,4]);window.__HELIO__.qa.setSeed([0,7,5]);window.__HELIO__.qa.setYaw(0)')
            page.keyboard.down('w')
            advanced=simulate(page,1.5)
            page.keyboard.up('w')
            assert advanced['gateIndex']>=1 and advanced['totalGates']>=1,advanced
            page.keyboard.press('x')
            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().view.locked')
            suspended=state(page)
            assert suspended['phase']==1 and suspended['elapsed']>1
            page.screenshot(path=str(OUTPUT/'menus-pause-1200x750.png'))
            check('Pause displays the active journey while releasing the mouse')

            page.locator('#pause-settings').click()
            page.wait_for_function('window.__HELIO__.getState().menu.section === "settings"')
            assert state(page)['mode']=='pause'
            assert page.locator('#settings-camera-slot #camera-settings').count()==1
            page.locator('#look-sensitivity').focus()
            page.keyboard.press('End')
            assert state(page)['view']['sensitivity']==2
            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().menu.section')
            assert page.locator('#pause-quick-settings #camera-settings').count()==1
            compare_journey(suspended,state(page))
            page.locator('#help-toggle').click()
            page.wait_for_function('window.__HELIO__.getState().menu.section === "guide"')
            page.locator('#panel-back').click()
            page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().menu.section')
            compare_journey(suspended,state(page))
            check('Pause settings and guide return to pause without advancing the journey')

            page.locator('#return-title').click()
            menu_ready(page)
            assert state(page)['menu']['suspended'] is True
            compare_journey(suspended,state(page))
            layout(page,'1200x750 with a suspended journey',True)
            page.wait_for_timeout(400)
            compare_journey(suspended,state(page))
            check('Return to sanctuary keeps the entire active journey suspended in memory')
            set_resume_observer(page)
            click_world(page,'continue')
            play_ready(page)
            restored=page.evaluate('window.__menuResumeSnapshot')
            assert restored is not None
            compare_journey(suspended,restored)
            assert not state(page)['menu']['suspended']
            check('Continue restores player, seed, gate, phase, elapsed time and velocity unchanged')

            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause"')
            page.locator('#pause-settings').click()
            page.wait_for_function('window.__HELIO__.getState().menu.section === "settings"')
            page.locator('#panel-back').click()
            page.wait_for_function('window.__HELIO__.getState().mode === "pause" && !window.__HELIO__.getState().menu.section')
            set_resume_observer(page)
            page.locator('#restart').click()
            play_ready(page)
            reset=page.evaluate('window.__menuResumeSnapshot')
            assert reset['chapter']==reset['gateIndex']==reset['totalGates']==0 and not reset['carrying'] and reset['phase']==0 and reset['elapsed']==0,reset
            assert page.locator('#menu-panel').is_hidden()
            assert page.locator('#pause-quick-settings #camera-settings').count()==1
            check('Restart begins a clean journey without leaving settings UI active')
            page.keyboard.press('Escape')
            page.wait_for_function('window.__HELIO__.getState().mode === "pause"')
            page.locator('#return-title').click()
            menu_ready(page)
            set_resume_observer(page)
            click_world(page,'start')
            play_ready(page)
            fresh=page.evaluate('window.__menuResumeSnapshot')
            assert fresh['chapter']==fresh['gateIndex']==fresh['totalGates']==0 and not fresh['carrying'] and fresh['elapsed']==0
            assert not fresh['menu']['suspended']
            check('New odyssey from the sanctuary replaces the suspended journey cleanly')
            context.close()

            saved_context=browser.new_context(viewport={'width':800,'height':600},device_scale_factor=1)
            saved_context.add_init_script("localStorage.setItem('helio-chapter','1')")
            saved_page=prepare_page(saved_context)
            saved_page.goto(URL+'/?qa=1',wait_until='networkidle')
            menu_ready(saved_page)
            layout(saved_page,'800x600 with a saved journey',True)
            saved_page.set_viewport_size({'width':1440,'height':900})
            layout(saved_page,'1440x900 with a saved journey',True)
            assert 'Jardin II' in saved_page.locator('#continue-detail').inner_text()
            click_world(saved_page,'continue')
            play_ready(saved_page)
            saved=state(saved_page)
            assert saved['chapter']==1 and saved['gateIndex']==0 and saved['totalGates']==3 and not saved['carrying'],saved
            check('Saved Continue launches the correct garden and captures the mouse')
            saved_context.close()
            assert not report['page_errors'],report['page_errors']
            assert not report['console_errors'],report['console_errors']
            assert not report['http_errors'],report['http_errors']
            check('No JavaScript, console or HTTP errors during all menu paths')
            report['passed']=True
        except Exception as error:
            report['passed']=False
            report['failure']=str(error)
            report['traceback']=traceback.format_exc()
            print(report['traceback'],flush=True)
            try:page.screenshot(path=str(OUTPUT/'menus-failure.png'))
            except Exception:pass
            raise
        finally:
            report['wall_seconds']=round(time.monotonic()-started,2)
            (OUTPUT/'menus-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            browser.close()
    print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'wall_seconds':report['wall_seconds']}),flush=True)


if __name__=='__main__':
    main()
