
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

        try:
            # Check for new button existence
            support_btn = page.locator('#btn-topbar-support')
            if support_btn.is_visible():
                print('Support button visible')

                # Check button color
                color = support_btn.eval_on_selector('i', 'el => window.getComputedStyle(el).color')
                print(f'Icon color: {color}') # Should be rgb(239, 68, 68) for #EF4444

                # Check isolation
                margin = support_btn.evaluate('el => window.getComputedStyle(el).marginLeft')
                print(f'Button margin-left: {margin}') # Should be 20px
            else:
                print('Support button NOT visible')

            # Check Old Button Absence
            if page.locator('#btn-bmc').count() == 0:
                print('Old BMC button removed')
            else:
                print('Old BMC button STILL PRESENT')

            # Check Topbar Padding
            padding = page.eval_on_selector('.topbar', 'el => window.getComputedStyle(el).padding')
            print(f'Topbar padding: {padding}') # Should be 0px 40px

            page.screenshot(path='verification/topbar_new_button.png')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/topbar_button_failed.png')

        browser.close()

if __name__ == '__main__':
    run()
