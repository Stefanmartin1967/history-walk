
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
                print(f'Default text width: {text_width}') # Should be 0px

                # Check icon color - Use element directly via locator
                # Note: Lucide icons are SVGs or i tags depending on rendering.
                # In our code it is <i data-lucide='heart'> which JS converts to <svg>
                # Let's target the svg inside the button
                icon_color = btn.locator('svg').evaluate('el => getComputedStyle(el).color')
                print(f'Default icon color: {icon_color}') # Should be rgb(239, 68, 68)

                # Simulate Hover
                btn.hover()
                page.wait_for_timeout(500) # Wait for transition

                # Check hover state (text revealed)
                hover_width = btn.locator('span').evaluate('el => getComputedStyle(el).maxWidth')
                print(f'Hover text width: {hover_width}') # Should be 150px

                page.screenshot(path='verification/topbar_button_hover_v2.png')
            else:
                print('Support button NOT visible')
        except Exception as e:
            print(f'Verification failed: {e}')
            page.screenshot(path='verification/topbar_hover_failed_v2.png')

        browser.close()

if __name__ == '__main__':
    run()
