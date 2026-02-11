
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto('http://localhost:8080/index.html')
        page.wait_for_timeout(2000)

        try:
            # Check Title Width
            title_width = page.locator('#app-title').evaluate('el => getComputedStyle(el).width')
            title_min_width = page.locator('#app-title').evaluate('el => getComputedStyle(el).minWidth')
            print(f'Title width: {title_width}, min-width: {title_min_width}')

            # Check Mes Circuits Button (Should have no text span or empty)
            # The span was removed in HTML.
            # Let's check if the button contains only icon
            btn_content = page.locator('#btn-open-my-circuits').inner_html()
            print(f'Mes Circuits Content: {btn_content}')

            # Check Tools Menu Location (Should be in topbar-left)
            # topbar-left children: Title, Search, MyCircuits, Zone, ..., Tools
            # Let's check if #btn-tools-menu is inside .topbar-left
            is_tools_left = page.locator('.topbar-left #btn-tools-menu').count() > 0
            print(f'Tools menu in left: {is_tools_left}')

            # Check Topbar Right (Should only have support button)
            # We can check children count of visible elements
            # Note: loaders are hidden.
            # Support button is #btn-topbar-support
            is_support_right = page.locator('.topbar-right #btn-topbar-support').count() > 0
            print(f'Support button in right: {is_support_right}')

            page.screenshot(path='verification/topbar_optimization.png')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/topbar_opt_failed.png')

        browser.close()

if __name__ == '__main__':
    run()
