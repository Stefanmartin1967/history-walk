
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

            # Check Mes Circuits Icon
            # The icon inside the button should be route
            # Lucide replaces <i data-lucide='route'> with <svg ... class='lucide lucide-route'>
            # We can check the class of the SVG
            try:
                svg_class = page.locator('#btn-open-my-circuits svg').get_attribute('class')
                print(f'Mes Circuits Icon Class: {svg_class}')

                # Check for absence of text
                text = page.locator('#btn-open-my-circuits').text_content()
                print(f'Mes Circuits Text: "{text.strip()}"')
            except Exception as e:
                print(f'Icon check error: {e}')

            page.screenshot(path='verification/final_layout.png')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/final_layout_failed.png')

        browser.close()

if __name__ == '__main__':
    run()
