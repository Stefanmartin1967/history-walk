
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto('http://localhost:8080/index.html')
        page.wait_for_timeout(2000)

        try:
            btn = page.locator('#btn-topbar-support')
            if btn.is_visible():
                print('Support button visible')

                # Check default state (text hidden)
                text_width = btn.locator('span').evaluate('el => getComputedStyle(el).maxWidth')
                print(f'Default text width: {text_width}')

                # Try to find SVG or I. The lucide library might replace <i> with <svg> or keep it.
                # If replacement happens async, it might take time.
                # Let's try waiting for SVG inside button
                try:
                    btn.locator('svg').wait_for(timeout=3000)
                    icon_color = btn.locator('svg').evaluate('el => getComputedStyle(el).color')
                    print(f'Default icon color (SVG): {icon_color}')
                except:
                    print('SVG not found, checking <i>')
                    icon_color = btn.locator('i').evaluate('el => getComputedStyle(el).color')
                    print(f'Default icon color (I): {icon_color}')

                # Simulate Hover
                btn.hover()
                page.wait_for_timeout(500)

                # Check hover state
                hover_width = btn.locator('span').evaluate('el => getComputedStyle(el).maxWidth')
                print(f'Hover text width: {hover_width}')

                page.screenshot(path='verification/topbar_button_hover_v3.png')
            else:
                print('Support button NOT visible')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/topbar_hover_failed_v3.png')

        browser.close()

if __name__ == '__main__':
    run()
