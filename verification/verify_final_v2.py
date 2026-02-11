
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto('http://localhost:8080/index.html')
        page.wait_for_timeout(2000)

        try:
            # Check Gap
            gap = page.locator('.topbar-left').evaluate('el => getComputedStyle(el).gap')
            print(f'Topbar gap: {gap}') # Should be 16px

            # Check Mes Circuits Icon - Check attribute on <i> if svg not replaced yet
            # or check data-lucide attribute
            icon_name = page.locator('#btn-open-my-circuits i').get_attribute('data-lucide')
            print(f'Mes Circuits Icon Name: {icon_name}')

            # Check text
            text = page.locator('#btn-open-my-circuits').text_content()
            print(f'Mes Circuits Text: "{text.strip()}"')

            page.screenshot(path='verification/final_layout_v2.png')
        except Exception as e:
            print(f'Verification failed: {e}')

        browser.close()

if __name__ == '__main__':
    run()
