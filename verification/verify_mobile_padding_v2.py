
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 375, 'height': 667})

        # Use localhost server
        page.goto('http://localhost:8080/index.html')

        # Wait for any potential loading
        page.wait_for_timeout(3000)

        # Check if mobile container exists
        if page.locator('#mobile-container').is_visible():
            print('Mobile container visible')

            # Since content is dynamically loaded, we might need to wait or trigger something.
            # However, the class .mobile-list-content should be in the DOM if renderMobileCircuitsList is called.
            # Let's try to grab the HTML to debug if selector fails.
            # html_content = page.content()
            # print(html_content[:500]) # Print first 500 chars for sanity check

            try:
                page.wait_for_selector('.mobile-list-content', timeout=5000)
                print('Found .mobile-list-content')

                padding_bottom = page.eval_on_selector('.mobile-list-content', 'el => window.getComputedStyle(el).paddingBottom')
                print(f'Computed padding-bottom: {padding_bottom}')

                page.screenshot(path='verification/mobile_padding_success.png')
            except Exception as e:
                print(f'Selector failed: {e}')
                page.screenshot(path='verification/mobile_padding_failed.png')
        else:
            print('Mobile container NOT visible')
            page.screenshot(path='verification/desktop_view.png')

        browser.close()

if __name__ == '__main__':
    run()
