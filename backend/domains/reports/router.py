"""
Reports domain — PDF rendering endpoint.
POST /api/reports/render-pdf  → accepts raw HTML body, returns application/pdf.

Requires WeasyPrint on the server:
  pip install "weasyprint>=60.0"
  # Ubuntu: apt-get install -y libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from domains.auth.router import get_current_user
from domains.auth.models import User

log = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/render-pdf")
async def render_pdf(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Render an HTML document to PDF and return it as a downloadable file."""
    html_bytes = await request.body()
    if not html_bytes:
        raise HTTPException(status_code=400, detail="Empty request body")

    html = html_bytes.decode("utf-8", errors="replace")

    try:
        from weasyprint import HTML as WeasyprintHTML  # noqa: PLC0415
        pdf_bytes: bytes = WeasyprintHTML(
            string=html,
            base_url="http://localhost",
        ).write_pdf()
    except ImportError:
        log.error("weasyprint_not_installed")
        raise HTTPException(
            status_code=503,
            detail="PDF rendering unavailable — install weasyprint on the server",
        )
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
