"""Render the WorkRadar documents (HTML → A4 PDF) with headless Chromium.

    python3 docs/src/build.py            # builds every docs/src/*.html into docs/*.pdf
"""
import asyncio, glob, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(HERE)
NAMES = {'prd': 'WorkRadar-PRD.pdf', 'ai-workflow': 'WorkRadar-AI-Workflow.pdf'}


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        for src in sorted(glob.glob(os.path.join(HERE, '*.html'))):
            key = os.path.splitext(os.path.basename(src))[0]
            out = os.path.join(DOCS, NAMES.get(key, key + '.pdf'))
            await page.goto('file://' + src)
            await page.evaluate('document.fonts.ready')
            await page.wait_for_timeout(300)
            overflow = await page.evaluate(
                """() => [...document.querySelectorAll('.page')].map((p, i) => ({ page: i + 1, over: p.scrollHeight - p.clientHeight }))"""
            )
            for o in overflow:
                if o['over'] > 1:
                    print(f"  ! {key} page {o['page']} overflows by {o['over']}px")
            await page.pdf(path=out, format='A4', print_background=True, prefer_css_page_size=True)
            print('wrote', os.path.relpath(out, DOCS))
        await browser.close()


asyncio.run(main())
