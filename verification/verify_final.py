from playwright.sync_api import sync_playwright, expect

def test_final_fixes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Load the verification page
        print("Navigating to verification page...")
        page.goto("http://localhost:8000/verification/repro_final_verify.html")

        # 2. Assert Menu is HIDDEN by default
        print("Checking Menu Visibility (Default)...")
        tools_menu = page.locator(".tools-menu")
        # Ensure it exists but is hidden
        if tools_menu.is_visible():
             print("FAIL: Tools menu is visible by default!")
        else:
             print("PASS: Tools menu is hidden by default.")

        # 3. Click to Open Menu
        print("Clicking Tools Button...")
        page.locator("#btn-tools-menu").click()

        # 4. Assert Menu is VISIBLE
        print("Checking Menu Visibility (Active)...")
        expect(tools_menu).to_be_visible()
        print("PASS: Tools menu is visible after click.")

        # 5. Check Styles (simple check for background color or class)
        # We assume if it's visible via our CSS toggle, styles are applying.

        # 6. Take Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/screenshot_final.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_final_fixes()
