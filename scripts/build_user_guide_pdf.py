"""Build My Expenses English user guide PDF (overview + settings)."""

from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.colors import HexColor
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
    PageBreak,
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
            fontSize=12,
            leading=15,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=3,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=10.5,
            leading=13,
            textColor=ACCENT,
            spaceBefore=7,
            spaceAfter=2,
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
        "link_hero": ParagraphStyle(
            "link_hero",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=11,
            leading=15,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=2,
        ),
        "link_label": ParagraphStyle(
            "link_label",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=10,
            leading=12,
            textColor=INK,
            alignment=TA_CENTER,
            spaceBefore=2,
            spaceAfter=2,
        ),
        "link_block": ParagraphStyle(
            "link_block",
            parent=base["Normal"],
            fontName="Guide",
            fontSize=10,
            leading=13,
            textColor=INK,
            alignment=TA_CENTER,
            spaceBefore=2,
            spaceAfter=6,
        ),
        "link": ParagraphStyle(
            "link",
            parent=base["Normal"],
            fontName="Guide-Bold",
            fontSize=10,
            leading=13,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=2,
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


def app_link_hero(s):
    """Large highlighted hyperlink block at the top of page 1."""
    return [
        Paragraph("App link (tap to open)", s["link_label"]),
        Paragraph(
            f'<link href="{APP_URL}" color="#{ACCENT.hexval()[2:]}">'
            f"<u>{APP_URL}</u></link>",
            s["link_hero"],
        ),
        Spacer(1, 2 * mm),
    ]


def app_link_paragraph(s):
    """Compact blue underlined hyperlink (later pages / footer areas)."""
    return Paragraph(
        f'Open the app: <link href="{APP_URL}" color="#{ACCENT.hexval()[2:]}">'
        f"<u>{APP_URL}</u></link>",
        s["link_block"],
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
        subject="Overview, install, and settings guide",
        creator=f"My Expenses guide by {AUTHOR}",
    )

    story = []

    # --- Page 1: link → install → what / who / why ---
    story.append(Paragraph("My Expenses", s["title"]))
    story.append(Paragraph("User guide", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=6))
    story.extend(app_link_hero(s))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=2, spaceAfter=4))

    story.append(Paragraph("1. Install on iPhone / iPad (Safari)", s["h1"]))
    story.append(
        bullets(
            [
                f'Open <link href="{APP_URL}" color="#{ACCENT.hexval()[2:]}"><u>the app link</u></link> '
                "in <b>Safari</b> (not Chrome / in-app browsers).",
                "Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.",
                "Open the Home Screen icon for standalone use and safer storage.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("2. Install on Android (Chrome)", s["h1"]))
    story.append(
        bullets(
            [
                f'Open <link href="{APP_URL}" color="#{ACCENT.hexval()[2:]}"><u>the app link</u></link> '
                "in <b>Chrome</b>.",
                "Menu (⋮) → <b>Install app</b> / <b>Add to Home screen</b> (or use the install banner).",
                "Open <b>My Expenses</b> from the app drawer or Home Screen.",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("3. Desktop &amp; moving phones", s["h1"]))
    story.append(
        Paragraph(
            "<b>Desktop:</b> Chrome/Edge → open the URL → Install / “Install page as app”, or bookmark. "
            "<b>New phone:</b> export <b>Backup (JSON)</b> on the old device → install on the new one → "
            "<b>More → Backup &amp; export → Import backup</b> (replaces local data after confirm).",
            s["body"],
        )
    )

    story.append(Paragraph("4. What this is", s["h1"]))
    story.append(
        Paragraph(
            "<b>My Expenses</b> is a euro (€) spending and income tracker that runs in the "
            "browser as a Progressive Web App (PWA). No account, no cloud sync — all data "
            "stays on your device. Log expenses, follow a monthly spend budget, set Savings "
            "(0–100% of that budget, € or %), track income and recurring subscriptions, and "
            "export JSON backups or month CSV files.",
            s["body"],
        )
    )

    story.append(Paragraph("5. Who it is for, and why", s["h1"]))
    story.append(
        Paragraph(
            f"Built for personal use by people who receive access from <b>{AUTHOR}</b>. "
            "It is not a public app-store product. Use it when you want a private, "
            "device-local budget tracker without signing up or syncing to a server.",
            s["body"],
        )
    )

    story.append(Paragraph("6. Who developed it — sharing rules", s["h1"]))
    story.append(
        Paragraph(
            f"My Expenses was developed by <b>{AUTHOR}</b>. The application link and this "
            "guide may be shared <b>only by him</b>. Do not redistribute without his permission.",
            s["body"],
        )
    )
    story.append(
        Paragraph(
            f"<b>Sharing notice.</b> Developed by {AUTHOR}. Share only with his permission.",
            s["note"],
        )
    )

    story.append(Paragraph("7. Main tabs (after install)", s["h1"]))
    story.append(
        bullets(
            [
                "<b>Add</b> — log a new expense (amount, category, subcategory, date, note); "
                "use <b>+</b> to add a category or turn a note into a subcategory",
                "<b>Month</b> — this month’s budget left, category progress, expense list",
                "<b>Chart</b> — visual spending breakdown for the selected month",
                "<b>More</b> — Plan, Income, Subscriptions, Categories, Backup &amp; export "
                "(see Settings guide on the next page)",
            ],
            s["bullet"],
        )
    )

    # --- Page 2+: Settings / More guide ---
    story.append(PageBreak())
    story.append(Paragraph("Settings guide — More", s["title"]))
    story.append(
        Paragraph(
            "Every control under the <b>More</b> tab, in order. Jump links at the top of More "
            "scroll to each section.",
            s["sub"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=4))
    story.append(app_link_paragraph(s))

    story.append(Paragraph("Plan", s["h2"]))
    story.append(
        Paragraph(
            "Set your <b>monthly spend budget</b> (the pool you plan to spend this month) and "
            "<b>usual monthly income</b>. Saving Plan updates category euro amounts when a "
            "category uses a fixed € limit. The spend budget is separate from income; leftover "
            "budget is split across flexible categories.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Monthly spend budget</b> — required; greater than zero",
                "<b>Usual monthly income</b> — used for cash/income views; greater than zero",
                "Warnings appear if pinned category shares exceed 100% or leave unallocated leftover",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("Income", s["h2"]))
    story.append(
        Paragraph(
            "Manage <b>extra income</b> (one-off amounts beyond usual income) and "
            "<b>income categories</b> (e.g. Salary, Other).",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Extra income list</b> — edit or delete past entries (amount, date, category)",
                "<b>Add extra income</b> — category, amount (EUR), date",
                "<b>Income categories</b> — rename, delete, or add new labels for income only "
                "(separate from expense categories)",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("Subscriptions", s["h2"]))
    story.append(
        Paragraph(
            "One place for the Subscriptions <b>budget share</b> and your <b>recurring</b> list. "
            "This category is not listed again under Categories.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Budget share / Edit plan</b> — Flexible (gets leftover %) or Fixed "
                "(set % or € of the monthly spend budget)",
                "<b>Recurring list</b> — each item: name, usual amount, day of month; "
                "delete when no longer needed",
                "<b>Add subscription</b> — creates a reminder; when due, the app can prompt "
                "you to log the charge as an expense in Subscriptions",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("Categories", s["h2"]))
    story.append(
        Paragraph(
            "Expense categories (except Subscriptions, which lives above, and system "
            "Uncategorised). Savings always appears here as Fixed and cannot be deleted.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Edit plan</b> — Flexible or Fixed; Fixed amount in <b>%</b> or <b>€</b> "
                "(toggle). Helper text shows the other unit.",
                "<b>Savings</b> — Fixed only; € preferred; may be <b>0</b>; cannot be negative; "
                "cannot exceed 100% / the full monthly spend budget",
                "<b>Rename / Delete</b> — delete moves that category’s expenses to Uncategorised",
                "<b>Subcategories</b> — add under a category for finer tracking on Add expense",
                "<b>Add category</b> — new expense category as flexible or fixed "
                "(or use <b>+</b> on the Add tab for a quick flexible category)",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("Backup &amp; export", s["h2"]))
    story.append(
        Paragraph(
            "Keep a copy of your data. Browsers can clear site storage; Home Screen install "
            "plus regular JSON exports are safer.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Export backup (JSON)</b> — full restore file for this or another device; "
                "updates “last backup” date",
                "<b>Import backup</b> — choose a JSON file; confirms counts, then "
                "<b>replaces all local data</b>",
                "<b>Month CSV</b> — Europe (; + comma decimals) or Standard (, + dot decimals) "
                "for the month you have open in Month",
                "<b>Backup reminder</b> — appears if you have data and no backup in 30+ days",
            ],
            s["bullet"],
        )
    )

    story.append(Paragraph("First-run setup (reminder)", s["h2"]))
    story.append(
        Paragraph(
            "Before More is available, setup asks for monthly spend budget, Savings "
            "(€ or %, including zero), and usual monthly income. Those values are the same "
            "ones you later edit under Plan / Savings.",
            s["body"],
        )
    )

    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=2, spaceAfter=6))
    story.append(
        Paragraph(
            f"© {AUTHOR} · My Expenses · Share only with his permission · "
            f'<link href="{APP_URL}" color="#{ACCENT.hexval()[2:]}"><u>{APP_URL}</u></link>',
            s["sub"],
        )
    )

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Guide", 7.5)
        label = "Install &amp; overview" if doc_.page == 1 else "Settings guide"
        # Footer text must not use HTML entities
        label = "Install & overview" if doc_.page == 1 else "Settings guide"
        canvas.drawCentredString(
            A4[0] / 2,
            7 * mm,
            f"My Expenses · {label} · {AUTHOR} · Page {doc_.page}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    pages = len(PdfReader(str(OUT)).pages)
    DESKTOP.write_bytes(OUT.read_bytes())
    print(f"{OUT} ({pages} pages)")
    print(DESKTOP)


if __name__ == "__main__":
    build()
