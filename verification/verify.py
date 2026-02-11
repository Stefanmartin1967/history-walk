from playwright.sync_api import sync_playwright, expect

def test_fixes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Load the verification page
        print("Navigating to verification page...")
        page.goto("http://localhost:8000/verification/repro_fix_verify.html")

        # 2. Assert Menu is HIDDEN
        print("Checking Menu Visibility...")
        # The dropdown content should not be visible initially
        dropdown_content = page.locator(".dropdown-content")
        # In Playwright, .is_visible() checks if it has non-empty bounding box and is not hidden by styles
        if dropdown_content.is_visible():
            print("FAIL: Menu dropdown content is visible!")
        else:
            print("PASS: Menu dropdown content is hidden.")

        # 3. Assert Sidebar Inputs are Visible
        print("Checking Sidebar Inputs...")
        input_aller = page.locator(".transport-field input").first
        expect(input_aller).to_be_visible()
        print("PASS: Sidebar input is visible.")

        # 4. Take Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/screenshot_fix.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_fixes()
