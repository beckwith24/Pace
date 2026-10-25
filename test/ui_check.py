"""Pace v2 end-to-end check at iPhone size.

Part 1 renders every screen in demo mode. Part 2 runs against a mocked
Intervals.icu (responses held back to capture the spinner), then exercises
sending, Move to Zwift, the library and the editor with power targets.
"""
import functools
import http.server
import json
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"
OUT.mkdir(exist_ok=True)
for f in OUT.glob("*.png"):
    f.unlink()
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
FIXED = "const RealDate=Date,fixed=new RealDate(2026,9,24,7,55).getTime();class FakeDate extends RealDate{constructor(...a){super(...(a.length?a:[fixed]))}static now(){return fixed}};window.Date=FakeDate;"
errors, problems = [], []


def shoot(page, name):
    page.wait_for_timeout(300)
    if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
        problems.append(f"horizontal overflow on {name}")
    broken = page.evaluate("[...document.querySelectorAll('#view img')].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src)")
    if broken:
        problems.append(f"broken images on {name}: {broken[:3]}")
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def nav(page, view):
    page.click(f"nav [data-view={view}]")
    page.wait_for_timeout(200)


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------------- Part 1: demo mode ----------------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("demo: " + str(e)))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.route("https://raw.githubusercontent.com/**", lambda r: r.abort())
    page.add_init_script(FIXED)
    page.goto(URL)
    page.wait_for_timeout(700)
    shoot(page, "01_today")
    page.click("button[data-action=change] >> nth=0"); page.wait_for_timeout(250)
    shoot(page, "02_change_sheet")
    page.click(".sheet-backdrop", position={"x": 20, "y": 20})
    nav(page, "plan"); shoot(page, "03_plan")
    nav(page, "library"); shoot(page, "04_library")
    page.click('button[data-action=lib-cat][data-cat=zwift]'); shoot(page, "05_library_zwift")
    page.click("button[data-action=open-tpl] >> nth=3"); page.wait_for_timeout(300); shoot(page, "06_template_zwift")
    page.click("button[data-action=tpl-back]")
    page.click('button[data-action=lib-cat][data-cat=strength]')
    page.click("button[data-action=open-tpl] >> nth=0"); page.wait_for_timeout(800); shoot(page, "07_template_lift")
    nav(page, "data"); page.wait_for_timeout(300)
    # hover the HRV chart to show the crosshair tooltip
    fig = page.locator("figure.chart").nth(1)
    fig.scroll_into_view_if_needed()
    box = fig.locator("svg").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.4)
    page.wait_for_timeout(200)
    if not page.locator(".ctip:not([hidden])").count():
        problems.append("chart tooltip did not appear")
    tip_text = page.locator(".ctip:not([hidden])").first.inner_text() if page.locator(".ctip:not([hidden])").count() else ""
    page.screenshot(path=str(OUT / "08b_chart_hover.png"))
    page.evaluate("window.scrollTo(0,0)")
    shoot(page, "08_data_trends")
    page.click('button[data-action=data-tab][data-tab=activities]'); shoot(page, "09_data_activities")
    page.click("button[data-action=open-act] >> nth=0"); shoot(page, "10_activity")
    page.click("details:has-text('All fields') summary"); page.wait_for_timeout(100)
    raw_rows = page.locator("table.raw tr").count()
    page.click("button[data-action=act-back]")
    page.click('button[data-action=data-tab][data-tab=log]'); shoot(page, "11_data_log")
    page.click("tr[data-action=open-day] >> nth=0"); shoot(page, "12_wellness_day")
    nav(page, "settings"); shoot(page, "13_settings")
    page.click('button[data-action=go-sub][data-sub=zones]'); shoot(page, "14_zones")
    page.click("button[data-action=sub-back]")
    page.click('button[data-action=go-sub][data-sub=schedule]'); shoot(page, "15_schedule")
    nav(page, "today")
    page.click("button[data-action=open] >> nth=0"); page.wait_for_timeout(300); shoot(page, "16_day_detail")
    ctx.close()

    # ---------------- Part 2: mocked Intervals.icu ----------------
    sent = {"bulk": [], "deleted": [], "put": []}
    hold = {"on": True, "routes": []}
    events_store = []

    def respond(route):
        req = route.request
        url, m = req.url, req.method
        if not req.headers.get("authorization", "").startswith("Basic "):
            return route.fulfill(status=401, body="no auth")
        body = None
        if "/wellness" in url:
            body = [{"id": f"2026-{mm:02d}-{dd:02d}", "hrv": 50 + (dd % 4), "restingHR": 55, "sleepSecs": 26500, "sleepScore": 80, "ctl": 20 + dd / 10, "atl": 22}
                    for mm, rng in ((7, range(1, 32)), (8, range(1, 32)), (9, range(1, 31)), (10, range(1, 24))) for dd in rng]
            body.append({"id": "2026-10-24", "hrv": 47, "restingHR": 57, "sleepSecs": 24000, "ctl": 22.5, "atl": 25, "weight": 81.2})
        elif "/activities" in url:
            body = [{"id": "i1", "start_date_local": "2026-10-20T07:00:00", "type": "Run", "name": "Morning Run", "moving_time": 1810, "distance": 5100, "average_heartrate": 131, "icu_training_load": 28, "icu_hr_zone_times": [300, 1400, 110, 0, 0]},
                    {"id": "i2", "start_date_local": "2026-10-21T18:00:00", "type": "VirtualRide", "name": "Zwift - Watopia", "moving_time": 2700, "distance": 22000, "icu_average_watts": 160, "icu_training_load": 35}]
        elif "/events/bulk" in url and m == "POST":
            evs = json.loads(req.post_data)
            sent["bulk"].append(evs)
            events_store[:] = [dict(e, id=100 + i) for i, e in enumerate(evs)]
            body = events_store
        elif "/events/" in url and m == "DELETE":
            sent["deleted"].append(url)
            body = {}
        elif "/events" in url:
            body = events_store or [{"id": 999, "external_id": "pace-2026-10-30", "category": "WORKOUT", "type": "Run"}]
        elif "/sport-settings/" in url and m == "PUT":
            sent["put"].append(json.loads(req.post_data)); body = {}
        elif "/sport-settings" in url:
            body = [{"id": 2, "types": ["Run"], "max_hr": 184, "hr_zones": [110, 129, 147, 166, 184]}, {"id": 1, "types": ["Ride", "VirtualRide"], "max_hr": 184, "hr_zones": [110, 129, 147, 166, 184], "ftp": 230}]
        elif url.rstrip("/").endswith("/athlete/0"):
            body = {"name": "Test Athlete", "id": "i0"}
        else:
            return route.fulfill(status=404, body="unknown " + url)
        route.fulfill(status=200, body=json.dumps(body), headers={"content-type": "application/json", "access-control-allow-origin": "*"})

    def handle(route):
        if hold["on"] and "/wellness" in route.request.url:
            hold["routes"].append(route)
            return
        respond(route)

    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("live: " + str(e)))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.route("https://raw.githubusercontent.com/**", lambda r: r.abort())
    page.route("https://intervals.icu/**", handle)
    page.add_init_script(FIXED + "if(!sessionStorage.getItem('seeded')){localStorage.setItem('pace.v1',JSON.stringify({apiKey:'abc123',planStart:'2026-10-05',autoSend:true}));sessionStorage.setItem('seeded','1')}")
    page.goto(URL)
    page.wait_for_timeout(500)
    chip = page.locator(".sync-chip").first.inner_text()
    busy = page.evaluate("document.body.classList.contains('busy') && !document.getElementById('progress').hidden && !!document.querySelector('.sync-chip .spin')")
    shoot(page, "20_loading_spinner")
    hold["on"] = False
    for r in hold["routes"]:
        respond(r)
    page.wait_for_timeout(1500)
    chip_after = page.locator(".sync-chip").first.inner_text()
    shoot(page, "21_today_live")
    first_send = sent["bulk"][0] if sent["bulk"] else []

    # Move Sunday's long ride to Zwift via the change sheet
    page.click('button[data-action=open][data-date="2026-10-25"] >> nth=0'); page.wait_for_timeout(200)
    page.click("button[data-action=change] >> nth=0"); page.wait_for_timeout(200)
    page.click("button[data-action=ch-indoor]"); page.wait_for_timeout(1500)
    shoot(page, "22_day_moved_to_zwift")
    zwift_ev = next((e for e in (sent["bulk"][-1] if sent["bulk"] else []) if e["start_date_local"].startswith("2026-10-25")), None)

    # Schedule a library workout on Tuesday
    nav(page, "library")
    page.fill("[data-lib-q]", "tempo")
    page.wait_for_timeout(200)
    page.click("button[data-action=open-tpl] >> nth=0")
    page.click('button[data-action=tpl-date][data-date="2026-10-27"]')
    page.click("button[data-action=tpl-schedule]"); page.wait_for_timeout(1500)
    tue_ev = next((e for e in (sent["bulk"][-1] if sent["bulk"] else []) if e["start_date_local"].startswith("2026-10-27")), None)

    # Edit the Zwift day: change a power target
    page.click('button[data-action=open][data-date="2026-10-25"] >> nth=0') if page.locator('button[data-action=open][data-date="2026-10-25"]').count() else None
    nav(page, "plan")
    page.click('button[data-action=open][data-date="2026-10-25"]'); page.wait_for_timeout(200)
    page.click("button[data-action=edit] >> nth=0"); page.wait_for_timeout(200)
    page.select_option('[data-ef=pw][data-p="0"]', "65-75")
    shoot(page, "23_editor_power")
    page.click("button[data-action=ed-save]"); page.wait_for_timeout(1500)
    sun_ev = next((e for e in (sent["bulk"][-1] if sent["bulk"] else []) if e["start_date_local"].startswith("2026-10-25")), None)

    # Data tab with live data + zones copy
    nav(page, "data"); shoot(page, "24_data_live")
    nav(page, "settings")
    page.click('button[data-action=go-sub][data-sub=zones]')
    zones_btn = page.locator("[data-zones-btn]").count()
    b.close()

srv.shutdown()
print("page errors:", errors or "none")
print("problems:", problems or "none")
print("tooltip text:", tip_text.replace("\n", " | "))
print("raw fields rows on activity:", raw_rows)
print("chip while loading:", chip, "| busy state:", busy, "| after:", chip_after)
print("first auto-send:", len(first_send), "events:", [(e["start_date_local"][:10], e["type"], e.get("indoor")) for e in first_send])
print("deleted stale:", sent["deleted"])
print("moved to zwift event:", zwift_ev and (zwift_ev["type"], zwift_ev.get("indoor"), zwift_ev["name"], zwift_ev["description"].splitlines()[0]))
print("library tuesday event:", tue_ev and (tue_ev["name"], tue_ev["description"].replace("\n", " / ")[:120]))
print("edited zwift event:", sun_ev and sun_ev["description"].splitlines()[0])
print("zones button shown (should be 0, zones match):", zones_btn)
ok = not errors and not problems and busy and first_send and zwift_ev and zwift_ev.get("indoor") and tue_ev and sun_ev and "65-75%" in sun_ev["description"]
sys.exit(0 if ok else 1)
