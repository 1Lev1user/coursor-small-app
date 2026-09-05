"""Build a compact 2-page My Expenses English user guide PDF."""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "My-Expenses-User-Guide.pdf"
DESKTOP = Path.home() / "Desktop" / "My-Expenses-User-Guide.pdf"
APP_URL = "https://1lev1user.github.io/coursor-small-app/"
AUTHOR = "Ļevs Krilovs"

pdfmetrics.registerFont(TTFont("Guide", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Guide-Bold", r"C:\Windows\Fonts\arialbd.ttf"))

INK = HexColor("#111827")
MUTED = HexColor("#4b5563")
ACCENT = HexColor("#2563eb")
LINE = HexColor("#d1d5db")
SOFT = HexColor("#eff6ff")


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=18,
            leading=22,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "sub",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=11.5,
            leading=14,
            textColor=INK,
            spaceBefore=7,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=9,
            leading=11.5,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=9,
            leading=11.5,
            textColor=INK,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            alignment=TA_LEFT,
            spaceBefore=2,
            spaceAfter=4,
            backColor=SOFT,
            borderPadding=5,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=7.5,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "link": ParagraphStyle(
            "link",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=9,
            leading=11,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
    }


def bullets(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=8, value="•") for item in items],
        bulletType="bullet",
        start="•",
        leftIndent=12,
        bulletFontName="Guide",
        bulletFontSize=9,
        spaceBefore=0,
        spaceAfter=2,
    )


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=11 * mm,
        bottomMargin=12 * mm,
        title="My Expenses — User Guide",
        author=AUTHOR,
        subject="How to use and install My Expenses (2 pages)",
        creator=f"My Expenses guide by {AUTHOR}",
    )

    story = []
    story.append(Paragraph("My Expenses", s["title"]))
    story.append(
        Paragraph(
            f"User guide · Developed by <b>{AUTHOR}</b> · Share only with his permission",
            s["sub"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=4))
    story.append(Paragraph(f'<link href="{APP_URL}">{APP_URL}</link>', s["link"]))
    story.append(
        Paragraph(
            f"<b>Sharing notice.</b> Developed by {AUTHOR}. The app link and this guide "
            "may be shared <b>only by him</b>. Do not redistribute without his permission.",
            s["note"],
        )
    )

    story.append(Paragraph("1. What this is", s["h1"]))
    story.append(
        Paragraph(
            "<b>My Expenses</b> is a euro (€) spending and income tracker that runs in the "
            "browser as a Progressive Web App (PWA). No account, no cloud sync — all data "
            "stays on your device. Use it to log expenses, follow a monthly spend budget, "
            "set Savings (0–100% of that budget, € or %), track income and recurring "
            "subscriptions, and export JSON backups or month CSV files.",
            s["body"],
        )
    )

    story.append(Paragraph("2. Who it is for", s["h1"]))
    story.append(
        Paragraph(
            f"Personal use for people who receive access from {AUTHOR}. Not a public store "
            f"app. <b>Credit:</b> developed by {AUTHOR}. <b>Sharing:</b> only he may share "
            "the application or this guide.",
            s["body"],
        )
    )

    story.append(Paragraph("3. How it works", s["h1"]))
    story.append(
        Paragraph(
            "<b>First launch:</b> set monthly spend budget, Savings (euro or %, zero allowed, "
            "never over 100% of budget), and usual monthly income. Change later under "
            "<b>More → Plan</b> and related sections.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Add</b> — new expense (amount, category, date, optional note)",
                "<b>Month</b> — totals, category progress, entries",
                "<b>Chart</b> — spending breakdown",
                "<b>More</b> — plan, income, subscriptions (budget + recurring list), "
                "categories, backup &amp; export",
            ],
            s["bullet"],
        )
    )
    story.append(
        Paragraph(
            "Categories can be <b>flexible</b> (share leftover budget) or <b>fixed</b> "
            "(set % or €). <b>Savings</b> is always fixed and cannot be deleted. "
            "Data lives only in this browser/app on this device — another phone starts empty "
            "unless you import a backup. Export JSON regularly under "
            "<b>More → Backup &amp; export</b>. Installing to the Home Screen is more reliable "
            "than a temporary browser tab.",
            s["body"],
        )
    )

    story.append(Paragraph("4. Install on iPhone / iPad (Safari)", s["h1"]))
    story.append(
        bullets(
            [
                f"Open <link href=\"{APP_URL}\">{APP_URL}</link> in <b>Safari</b> "
                "(not Chrome / in-app browsers).",
                "Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.",
                "Open the Home Screen icon for standalone use and safer storage.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("5. Install on Android (Chrome)", s["h1"]))
    story.append(
        bullets(
            [
                f"Open the same link in <b>Chrome</b>.",
                "Menu (⋮) → <b>Install app</b> / <b>Add to Home screen</b> (or use the install banner).",
                "Open <b>My Expenses</b> from the app drawer or Home Screen.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("6. Desktop &amp; moving phones", s["h1"]))
    story.append(
        Paragraph(
            "<b>Desktop:</b> in Chrome/Edge, open the URL and use Install / “Install page as app” "
            "if offered, or bookmark it. <b>New phone:</b> on the old device export "
            "<b>Backup (JSON)</b>; install on the new device; then "
            "<b>More → Backup &amp; export → Import backup</b> (replaces local data after confirm).",
            s["body"],
        )
    )

    story.append(Paragraph("7. Attribution", s["h1"]))
    story.append(
        Paragraph(
            f"My Expenses was developed by <b>{AUTHOR}</b>. The application and this guide "
            "may be shared <b>only by him</b>. If you received them from someone else, do not "
            f"pass them on without permission from {AUTHOR}.",
            s["body"],
        )
    )

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Guide", 7.5)
        canvas.drawCentredString(
            A4[0] / 2,
            7 * mm,
            f"My Expenses · Developed by {AUTHOR} · Share only with his permission · Page {_doc.page}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    from pypdf import PdfReader

    pages = len(PdfReader(str(OUT)).pages)
    DESKTOP.write_bytes(OUT.read_bytes())
    print(f"{OUT} ({pages} pages)")
    print(f"{DESKTOP}")
    if pages > 2:
        raise SystemExit(f"Expected at most 2 pages, got {pages}")


if __name__ == "__main__":
    build()
