
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Set viewport and user agent to simulate a mobile device
        page = browser.new_page(
            viewport={'width': 375, 'height': 667},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )

        # Use localhost server
        page.goto('http://localhost:8080/index.html')

        # Wait for potential initial load
        page.wait_for_timeout(3000)

        # Check if mobile container is visible
        mobile_container = page.locator('#mobile-container')
        if mobile_container.is_visible():
            print('Mobile container is visible.')

            # Since the content is dynamically loaded via JS, verify if any mobile list items are present.
            # This implicitly checks if renderMobileCircuitsList has run.
            try:
                # Wait for the specific class we added
                page.wait_for_selector('.mobile-list-content', timeout=10000)
                print('Success: Found .mobile-list-content')

                # Verify padding
                padding_bottom = page.eval_on_selector('.mobile-list-content', 'el => window.getComputedStyle(el).paddingBottom')
                print(f'Computed padding-bottom: {padding_bottom}')

                page.screenshot(path='verification/mobile_padding_final.png')
            except Exception as e:
                print(f'Error finding selector: {e}')
                page.screenshot(path='verification/mobile_padding_error.png')
        else:
            print('Mobile container NOT visible. Check mobile detection logic.')
            page.screenshot(path='verification/desktop_fallback.png')

        browser.close()

if __name__ == '__main__':
    run()
