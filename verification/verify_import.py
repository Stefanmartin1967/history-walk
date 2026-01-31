from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # URL with import parameters
        url = "http://localhost:5173/history-walk/?import=HW-01K77WPE67RPHVJVH6A0PC0ZWD&name=TestCircuit"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for the circuit to load (it uses setTimeout 500ms in main.js, plus some async ops)
        page.wait_for_timeout(5000)

        # Take a screenshot
        screenshot_path = "/home/jules/verification/import_verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Check if the title is correct
        # Note: on desktop, the circuit panel should be open.
        # We need to check #circuit-title-text
        try:
            title_element = page.locator("#circuit-title-text")
            # We wait for it to be attached/visible
            try:
                title_element.wait_for(state="visible", timeout=5000)
                text = title_element.text_content()
                print(f"Circuit Title found: '{text}'")
                if "TestCircuit" in text:
                    print("SUCCESS: Circuit name imported correctly.")
                else:
                    print(f"FAILURE: Expected 'TestCircuit' in title, found '{text}'")
            except:
                print("WARNING: Circuit title element not found or not visible.")

            # Check toast messages for success
            toasts = page.locator(".toast").all_text_contents()
            print("Toasts:", toasts)

        except Exception as e:
            print(f"Error checking title: {e}")

        browser.close()

if __name__ == "__main__":
    run()
