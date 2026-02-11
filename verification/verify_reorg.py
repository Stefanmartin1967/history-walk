
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto('http://localhost:8080/index.html')
        page.wait_for_timeout(2000)

        try:
            # Check structure: .topbar-right should contain .tools-dropdown-container AND .btn-support
            # We can check the count of children or their order

            right_container = page.locator('.topbar-right')

            # Check for Tools Menu Button
            tools_btn = right_container.locator('#btn-tools-menu')
            if tools_btn.is_visible():
                print('Tools menu visible in topbar-right')
            else:
                print('Tools menu NOT visible in topbar-right')

            # Check for Support Button
            support_btn = right_container.locator('#btn-topbar-support')
            if support_btn.is_visible():
                print('Support button visible in topbar-right')
            else:
                print('Support button NOT visible in topbar-right')

            # Check CSS Gap
            gap = right_container.evaluate('el => getComputedStyle(el).gap')
            print(f'Topbar right gap: {gap}') # Should be 15px

            page.screenshot(path='verification/topbar_reorg.png')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/topbar_reorg_failed.png')

        browser.close()

if __name__ == '__main__':
    run()
