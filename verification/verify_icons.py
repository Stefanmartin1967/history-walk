from playwright.sync_api import sync_playwright

def test_map_icons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the verification page
        print("Navigating to map icon verification page...")
        page.goto("http://localhost:8000/verification/map_icon_verify.html")

        # Take Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/map_icon_verify.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_map_icons()
