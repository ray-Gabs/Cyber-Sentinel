"""
Reports domain — PDF rendering endpoint.
POST /api/reports/render-pdf  → accepts raw HTML body, returns application/pdf.

Uses Playwright (headless Chromium) for pixel-perfect CSS rendering.

First-time setup (run once per environment):
  pip install playwright
  playwright install chromium        # bare VM
  playwright install --with-deps chromium  # Docker / fresh Ubuntu
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from core.rate_limit import get_user_or_ip_key, limiter
from domains.auth.models import User
from domains.auth.router import get_current_user

log = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/render-pdf")
@limiter.limit("10/hour", key_func=get_user_or_ip_key)
async def render_pdf(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Render an HTML document to PDF via headless Chromium and return as a file download."""
    html_bytes = await request.body()
    if not html_bytes:
        raise HTTPException(status_code=400, detail="Empty request body")

    html = html_bytes.decode("utf-8", errors="replace")

    try:
        from playwright.async_api import async_playwright  # noqa: PLC0415
    except ImportError:
        log.error("playwright_not_installed")
        raise HTTPException(
            status_code=503,
            detail=(
                "PDF rendering unavailable. "
                "Run: pip install playwright && playwright install chromium"
            ),
        )

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            page = await browser.new_page()

            # networkidle waits for Google Fonts and all sub-resources to finish
            await page.set_content(html, wait_until="networkidle", timeout=30_000)

            # prefer_css_page_size respects our @page { size: A4 landscape/portrait }
            pdf_bytes: bytes = await page.pdf(
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            await browser.close()

    except Exception as exc:
        log.error("pdf_render_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"PDF render failed: {exc}")

    log.info(
        "pdf_rendered",
        user_id=str(current_user.id),
        size_kb=round(len(pdf_bytes) / 1024, 1),
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=report.pdf",
            "Content-Length": str(len(pdf_bytes)),
        },
    )
