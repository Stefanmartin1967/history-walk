
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Test Topbar Layout (Desktop)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        # Use localhost server
        page.goto('http://localhost:8080/index.html')

        # Wait for any potential loading
        page.wait_for_timeout(2000)

        # Check Topbar Gap
        try:
            gap = page.eval_on_selector('.topbar-left', 'el => window.getComputedStyle(el).gap')
            print(f'Topbar gap: {gap}')

            # Check Button Flex Shrink
            shrink = page.eval_on_selector('.topbar .btn', 'el => window.getComputedStyle(el).flexShrink')
            print(f'Button flex-shrink: {shrink}')

            page.screenshot(path='verification/topbar_fix.png')
        except Exception as e:
            print(f'Desktop CSS check failed: {e}')
            page.screenshot(path='verification/topbar_failed.png')

        browser.close()

if __name__ == '__main__':
    run()
