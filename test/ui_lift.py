"""Strength day in demo mode: photos, how-to, library picker, custom exercise."""
import functools
import http.server
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"
OUT.mkdir(exist_ok=True)
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
errors, problems = [], []


def shoot(page, name):
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def broken_images(page):
    return page.evaluate("""() => [...document.querySelectorAll('#view img')]
        .filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)""")


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.add_init_script("""
      const RealDate = Date, fixed = new RealDate(2026, 9, 26, 7, 0).getTime();
      class FakeDate extends RealDate { constructor(...a){ super(...(a.length ? a : [fixed])); } static now(){ return fixed; } }
      window.Date = FakeDate;""")
    page.goto(URL)
    page.wait_for_timeout(600)
    shoot(page, "20_today_lift")
    page.click("button.btn.primary >> text=View steps")
    page.wait_for_timeout(1500)
    page.click("details:has-text('How to do it') >> nth=0")
    shoot(page, "21_lift_detail")
    if broken_images(page): problems.append(("detail", broken_images(page)))
    n_pics = page.locator(".pics img").count()
    print("photos on detail:", n_pics, "| how-to sections:", page.locator("details:has-text('How to do it')").count(),
          "| muscle tags:", page.locator(".tag").count())

    page.click("button[data-action=edit] >> nth=0")
    page.click('button[data-action=ed-pick] >> nth=0')
    page.fill("[data-pick-q]", "lunge")
    page.wait_for_timeout(300)
    print("picker focus kept:", page.evaluate("document.activeElement && document.activeElement.dataset.pickQ === '1'"))
    shoot(page, "22_picker")
    print("lunge results:", page.locator("button[data-action=ed-pick-choose]").count())
    page.click("button[data-action=ed-pick-choose] >> nth=1")
    page.click("button[data-action=ed-add-lift]")
    page.click('button[data-action=ed-pick-eq][data-eq="all"]')
    page.fill("[data-pick-q]", "farmer walk")
    page.wait_for_timeout(300)
    page.click("button[data-action=ed-pick-custom]")
    shoot(page, "23_editor_lift_pics")
    page.click("button[data-action=ed-save]")
    page.wait_for_timeout(1500)
    shoot(page, "24_lift_detail_edited")
    if broken_images(page): problems.append(("edited detail", broken_images(page)))
    names = page.locator(".card.lift .step-name").all_inner_texts()
    print("exercises after edit:", names)
    b.close()
srv.shutdown()
print("page errors:", errors or "none", "| broken images:", problems or "none")
sys.exit(1 if errors or problems or n_pics < 10 else 0)
