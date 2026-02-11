
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Set viewport to mobile size to trigger mobile view logic
        page.set_viewport_size({'width': 375, 'height': 667})

        # Open the local file directly since it is static
        page.goto('file:///app/index.html')

        # Wait for the mobile list content to appear
        page.wait_for_selector('.mobile-list-content')

        # Check computed style for padding-bottom
        padding_bottom = page.eval_on_selector('.mobile-list-content', 'el => window.getComputedStyle(el).paddingBottom')
        print(f'Computed padding-bottom: {padding_bottom}')

        # Take a screenshot
        page.screenshot(path='verification/mobile_padding.png')
        browser.close()

if __name__ == '__main__':
    run()
