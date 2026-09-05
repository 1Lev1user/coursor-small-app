"""Build the My Expenses English user guide PDF."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

OUT = Path(__file__).resolve().parents[1] / "docs" / "My-Expenses-User-Guide.pdf"
APP_URL = "https://1lev1user.github.io/coursor-small-app/"
AUTHOR = "Ļevs Krilovs"

FONT = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")

pdfmetrics.registerFont(TTFont("Guide", str(FONT)))
pdfmetrics.registerFont(TTFont("Guide-Bold", str(FONT_BOLD)))

INK = HexColor("#111827")
MUTED = HexColor("#4b5563")
ACCENT = HexColor("#2563eb")
LINE = HexColor("#d1d5db")
SOFT = HexColor("#eff6ff")


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=11,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=28,
            leading=34,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=12,
            leading=18,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=16,
            leading=22,
            textColor=INK,
            spaceBefore=16,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=12.5,
            leading=17,
            textColor=INK,
            spaceBefore=10,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=10.5,
            leading=15,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=10.5,
            leading=15,
            textColor=INK,
            leftIndent=4,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=10,
            leading=14,
            textColor=MUTED,
            alignment=TA_LEFT,
            spaceBefore=4,
            spaceAfter=8,
            backColor=SOFT,
            borderPadding=8,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=8.5,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "link": ParagraphStyle(
            "link",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=10.5,
            leading=15,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
    }


def bullets(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=12, bulletColor=ACCENT) for item in items],
        bulletType="bullet",
        start="•",
        leftIndent=18,
        bulletFontName="Guide",
        bulletFontSize=10.5,
    )


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="My Expenses — User Guide",
        author=AUTHOR,
        subject="How to use and install My Expenses",
        creator=f"My Expenses guide by {AUTHOR}",
    )

    story = []
    story.append(Spacer(1, 18 * mm))
    story.append(Paragraph("PERSONAL FINANCE PWA", s["cover_kicker"]))
    story.append(Paragraph("My Expenses", s["cover_title"]))
    story.append(Paragraph("User guide — what it is, how it works, and how to install it", s["cover_sub"]))
    story.append(Paragraph(f"Developed by <b>{AUTHOR}</b>", s["cover_sub"]))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=LINE, spaceBefore=4, spaceAfter=12))
    story.append(Paragraph(f'<link href="{APP_URL}">{APP_URL}</link>', s["link"]))
    story.append(
        Paragraph(
            f"<b>Sharing notice.</b> This application was developed by {AUTHOR}. "
            "It may be shared only by him. Do not redistribute the app link, install "
            "instructions, or copies of this guide without his permission.",
            s["note"],
        )
    )

    story.append(Paragraph("1. What this is", s["h1"]))
    story.append(
        Paragraph(
            "<b>My Expenses</b> is a simple euro (€) spending and income tracker that runs "
            "in your phone or computer browser as a Progressive Web App (PWA). "
            "There is no account and no cloud sync: everything stays on your device.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "Track daily expenses by category and subcategory",
                "Set a monthly spend budget and see how much is left",
                "Pin Savings (0%–100% of the monthly spend budget, in € or %)",
                "Log usual income and extra income",
                "Remember recurring subscriptions and get due reminders",
                "Export / import a full JSON backup, or download a month as CSV",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("2. Who it is for", s["h1"]))
    story.append(
        Paragraph(
            "It is intended for personal use by people who receive access from "
            f"{AUTHOR}. It is not a public product store app and is not meant for "
            "uncontrolled redistribution.",
            s["body"],
        )
    )
    story.append(
        Paragraph(
            f"<b>Credit:</b> Developed by {AUTHOR}. <b>Sharing:</b> only he may share "
            "the application (link, installs, or this guide).",
            s["body"],
        )
    )

    story.append(Paragraph("3. How it works", s["h1"]))
    story.append(Paragraph("First launch", s["h2"]))
    story.append(
        Paragraph(
            "On first open you set your <b>monthly spend budget</b>, <b>Savings</b> "
            "(euro or percent, zero allowed, never more than 100% of the budget), "
            "and your <b>usual monthly income</b>. You can change these later under "
            "<b>More → Plan</b> and related sections.",
            s["body"],
        )
    )
    story.append(Paragraph("Main tabs", s["h2"]))
    story.append(
        bullets(
            [
                "<b>Add</b> — log a new expense (amount, category, date, optional note)",
                "<b>Month</b> — this month’s totals, category progress, and entries",
                "<b>Chart</b> — spending breakdown",
                "<b>More</b> — plan, income, subscriptions, categories, backup &amp; export",
            ],
            s["bullet"],
        )
    )
    story.append(Paragraph("Budget logic (short)", s["h2"]))
    story.append(
        Paragraph(
            "Your <b>monthly spend budget</b> is the pool you plan to spend. "
            "Categories can be <b>flexible</b> (share leftover budget) or <b>fixed</b> "
            "(a set % or € amount). <b>Savings</b> is always fixed and cannot be deleted. "
            "<b>Subscriptions</b> has its own section in More: budget share plus a list "
            "of recurring items with day-of-month reminders.",
            s["body"],
        )
    )
    story.append(Paragraph("Data &amp; backups", s["h2"]))
    story.append(
        Paragraph(
            "Data is stored only in this browser / installed app on this device. "
            "Another phone or browser starts empty unless you import a backup. "
            "Use <b>More → Backup &amp; export → Export backup (JSON)</b> regularly. "
            "Safari and some browsers can clear site data; installing to the Home Screen "
            "is more reliable.",
            s["body"],
        )
    )

    story.append(Paragraph("4. Open the app", s["h1"]))
    story.append(
        Paragraph(
            f'Open this link in your browser: <link href="{APP_URL}"><b>{APP_URL}</b></link>',
            s["body"],
        )
    )

    story.append(Paragraph("5. Install on iPhone / iPad (Safari)", s["h1"]))
    story.append(
        bullets(
            [
                "Open the link above in <b>Safari</b> (not Chrome or in-app browsers).",
                "Tap the <b>Share</b> button (square with an arrow pointing up).",
                "Scroll and tap <b>Add to Home Screen</b>.",
                "Confirm the name <b>My Expenses</b> (or Expenses) and tap <b>Add</b>.",
                "Open the new icon from your Home Screen — it runs like a standalone app.",
            ],
            s["bullet"],
        )
    )
    story.append(
        Paragraph(
            "Tip: Keep using the Home Screen icon so your data is less likely to be cleared "
            "than in a temporary Safari tab.",
            s["body"],
        )
    )

    story.append(Paragraph("6. Install on Android (Chrome)", s["h1"]))
    story.append(
        bullets(
            [
                "Open the link above in <b>Chrome</b>.",
                "Tap the menu (⋮). Choose <b>Install app</b> or <b>Add to Home screen</b>.",
                "If you see an install banner, you can use that instead.",
                "Confirm install. Open <b>My Expenses</b> from your app drawer or Home Screen.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("7. Desktop (optional)", s["h1"]))
    story.append(
        Paragraph(
            "In Chrome or Edge on a computer, open the app URL and use the install / "
            "“Install page as app” control in the address bar if offered. You can also "
            "bookmark the page and use it in the browser.",
            s["body"],
        )
    )

    story.append(Paragraph("8. Moving to a new phone", s["h1"]))
    story.append(
        bullets(
            [
                "On the old device: <b>More → Backup &amp; export → Export backup (JSON)</b> "
                "and save the file somewhere safe (Files, Drive, email to yourself).",
                "Install My Expenses on the new device (sections 5–6).",
                "On the new device: <b>More → Backup &amp; export → Import backup</b> "
                "and choose that JSON file. Import replaces local data after confirmation.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("9. Attribution &amp; sharing rules", s["h1"]))
    story.append(
        Paragraph(
            f"My Expenses was developed by <b>{AUTHOR}</b>.",
            s["body"],
        )
    )
    story.append(
        Paragraph(
            "The application and this guide may be shared <b>only by him</b>. "
            "If you received this guide or the app link from someone else, please do not "
            f"pass it on further without permission from {AUTHOR}.",
            s["body"],
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=LINE, spaceBefore=2, spaceAfter=10))
    story.append(
        Paragraph(
            f"© {AUTHOR} · My Expenses · For personal use by recipients he chooses to share with",
            s["footer"],
        )
    )

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Guide", 8)
        canvas.drawCentredString(
            A4[0] / 2,
            10 * mm,
            f"My Expenses · Developed by {AUTHOR} · Share only with his permission",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    build()
