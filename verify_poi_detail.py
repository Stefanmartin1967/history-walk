from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 375, "height": 667})
    page = context.new_page()

    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    print("Navigating to app...")
    try:
        page.goto("http://localhost:8080/index_verify.html")
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"Navigation error: {e}")

    # To test POI Detail, we need to click on a POI in a circuit list.
    # Assuming 'djerba' loads and mobile view shows 'circuits' by default.
    # If no circuits are loaded, we might need to rely on the 'djerba.geojson' loading logic which seems to fail in verify env.

    # However, in previous verify run:
    # PAGE LOG: Mobile: Chargement données sans rendu carte.
    # So features are loaded.

    # But circuits list depends on `state.myCircuits` or `state.officialCircuits`.
    # PAGE LOG: [Main] Pas de circuits officiels trouvés pour 'djerba' (Fichier manquant ou 404).

    # So the list might be empty.
    # We can try to switch to Search view, search for something, and click a result.

    print("Switching to Search View...")
    page.click('button[data-view="search"]')
    page.wait_for_timeout(1000)

    print("Searching for a POI...")
    page.fill('#mobile-search-input', 'Houmt') # Assuming "Houmt Souk" exists
    page.wait_for_timeout(1000)

    print("Clicking first result...")
    # .result-item is created in renderMobileSearch
    try:
        page.click('.result-item', timeout=2000)
        page.wait_for_timeout(1000)
        print("Taking screenshot 4: POI Detail View")
        page.screenshot(path="verification_4_poi_detail.png")
    except Exception as e:
        print(f"Could not click result: {e}")
        # Capture what we see anyway
        page.screenshot(path="verification_4_poi_detail_failed.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
