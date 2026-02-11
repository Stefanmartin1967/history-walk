
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 375, 'height': 667})

        # Use localhost server
        page.goto('http://localhost:8080/index.html')

        # Wait for any potential loading
        page.wait_for_timeout(3000)

        # Manually trigger mobile init if auto-detect fails
        page.evaluate('window.dispatchEvent(new Event("resize"))')

        # Check if mobile container exists
        if page.locator('#mobile-container').is_visible():
            print('Mobile container visible')

            # Check for refactored classes
            try:
                # 1. Header
                page.wait_for_selector('.mobile-header-title-text', timeout=5000)
                print('Found .mobile-header-title-text')

                # 2. Circuit Card wrapper
                # Need to wait for list to render. If empty, we look for reset button
                if page.locator('.mobile-circuit-wrapper').count() > 0:
                    print('Found .mobile-circuit-wrapper')
                elif page.locator('.mobile-inline-filter-reset-btn').count() > 0:
                    print('Found .mobile-inline-filter-reset-btn')
                else:
                    print('No circuits or reset button found yet.')

                page.screenshot(path='verification/mobile_refactor_check.png')
            except Exception as e:
                print(f'Selector failed: {e}')
                page.screenshot(path='verification/mobile_refactor_failed.png')
        else:
            print('Mobile container NOT visible')

        browser.close()

if __name__ == '__main__':
    run()
