"""Render Pace at iPhone size: demo screenshots, then a mocked Intervals.icu run."""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
OUT = ROOT / "shots"
OUT.mkdir(exist_ok=True)
errors = []


def shoot(page, name):
    page.wait_for_timeout(250)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())

    # ---- demo mode ----
    page.goto(URL)
    shoot(page, "1_today_demo")
    page.click("nav [data-view=plan]"); shoot(page, "2_plan_demo")
    page.click("nav [data-view=zones]"); shoot(page, "3_zones_demo")
    page.click("nav [data-view=settings]"); shoot(page, "4_settings")
    page.click("nav [data-view=today]")
    page.click("button.btn.primary >> text=View steps"); shoot(page, "5_detail_demo")

    # ---- mocked real mode ----
    sent = {"bulk": None, "deleted": [], "put": []}

    def handle(route):
        req = route.request
        url, m = req.url, req.method
        auth = req.headers.get("authorization", "")
        if not auth.startswith("Basic "):
            return route.fulfill(status=401, body="no auth")
        body = None
        if "/wellness" in url:
            body = [{"id": f"2026-10-{d:02d}", "hrv": 50 + (d % 4), "restingHR": 55, "sleepSecs": 26000, "ctl": 15, "atl": 16} for d in range(1, 24)]
            body.append({"id": "2026-10-24", "hrv": 41, "restingHR": 59, "sleepSecs": 22000, "ctl": 15, "atl": 19})
        elif "/activities" in url:
            body = [{"start_date_local": "2026-10-20T07:00:00", "type": "Run"}]
        elif "/events/bulk" in url and m == "POST":
            sent["bulk"] = json.loads(req.post_data)
            body = sent["bulk"]
        elif "/events/" in url and m == "DELETE":
            sent["deleted"].append(url)
            return route.fulfill(status=200, body="{}", headers={"content-type": "application/json"})
        elif "/events" in url:
            body = [{"id": 999, "external_id": "pace-2026-10-30", "category": "WORKOUT"}]
        elif "/sport-settings/" in url and m == "PUT":
            sent["put"].append(json.loads(req.post_data))
            body = {}
        elif "/sport-settings" in url:
            body = [{"id": 2, "types": ["Run"], "max_hr": 190, "hr_zones": [130, 145, 160, 175, 190]},
                    {"id": 1, "types": ["Ride", "VirtualRide"], "max_hr": 185, "hr_zones": [120, 140, 155, 170, 185]}]
        elif url.rstrip("/").endswith("/athlete/0"):
            body = {"name": "Test Athlete"}
        else:
            return route.fulfill(status=404, body="unknown " + url)
        route.fulfill(status=200, body=json.dumps(body), headers={"content-type": "application/json", "access-control-allow-origin": "*"})

    page.route("https://intervals.icu/**", handle)
    page.add_init_script("""
      const RealDate = Date;
      const fixed = new RealDate(2026, 9, 24, 7, 55).getTime();
      class FakeDate extends RealDate { constructor(...a){ super(...(a.length ? a : [fixed])); } static now(){ return fixed; } }
      window.Date = FakeDate;
      localStorage.setItem('pace.v1', JSON.stringify({apiKey:'abc123', planStart:'2026-10-05', autoSend:true}));
    """)
    page.goto(URL)
    page.wait_for_timeout(1200)
    shoot(page, "6_today_live")
    page.click("nav [data-view=zones]"); page.wait_for_timeout(300); shoot(page, "7_zones_live")
    page.click("button[data-action=syncZones]"); page.wait_for_timeout(800)
    page.click("nav [data-view=plan]"); shoot(page, "8_plan_live")
    page.click("nav [data-view=today]")
    page.click("button.btn.primary >> text=View steps"); shoot(page, "9_detail_live")
    b.close()

print("page errors:", errors or "none")
print("auto-send bulk events:")
for e in sent["bulk"] or []:
    print(" ", e["start_date_local"][:10], e["type"].ljust(14), e["name"], "|", e["description"].replace("\n", " / ")[:110])
print("deleted stale:", sent["deleted"])
print("zone PUTs:", sent["put"])
sys.exit(1 if errors or not sent["bulk"] else 0)
