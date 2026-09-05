"""Build illustrated My Expenses user guide PDF."""

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
    Image,
    KeepTogether,
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
ASSETS = ROOT / "docs" / "guide-assets"
APP_URL = "https://1lev1user.github.io/coursor-small-app/"
AUTHOR = "Ļevs Krilovs"
ACCENT_CSS = "2563eb"

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
            "title", parent=base["Normal"], fontName="Guide-Bold", fontSize=18,
            leading=22, textColor=INK, alignment=TA_CENTER, spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "sub", parent=base["Normal"], fontName="Guide", fontSize=9,
            leading=12, textColor=MUTED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Normal"], fontName="Guide-Bold", fontSize=12,
            leading=15, textColor=INK, spaceBefore=8, spaceAfter=3,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"], fontName="Guide-Bold", fontSize=10.5,
            leading=13, textColor=ACCENT, spaceBefore=6, spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Guide", fontSize=9,
            leading=11.5, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["Normal"], fontName="Guide", fontSize=9,
            leading=11.5, textColor=INK,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"], fontName="Guide", fontSize=8,
            leading=10, textColor=MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=6,
        ),
        "note": ParagraphStyle(
            "note", parent=base["Normal"], fontName="Guide", fontSize=8.5,
            leading=11, textColor=MUTED, alignment=TA_LEFT, spaceBefore=2,
            spaceAfter=4, backColor=SOFT, borderPadding=5,
        ),
        "link_hero": ParagraphStyle(
            "link_hero", parent=base["Normal"], fontName="Guide-Bold", fontSize=11,
            leading=15, textColor=ACCENT, alignment=TA_CENTER, spaceBefore=4, spaceAfter=2,
        ),
        "link_label": ParagraphStyle(
            "link_label", parent=base["Normal"], fontName="Guide-Bold", fontSize=10,
            leading=12, textColor=INK, alignment=TA_CENTER, spaceBefore=2, spaceAfter=2,
        ),
        "link_block": ParagraphStyle(
            "link_block", parent=base["Normal"], fontName="Guide", fontSize=10,
            leading=13, textColor=INK, alignment=TA_CENTER, spaceBefore=2, spaceAfter=6,
        ),
    }


def bullets(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=8, value="•") for item in items],
        bulletType="bullet", start="•", leftIndent=12,
        bulletFontName="Guide", bulletFontSize=9, spaceBefore=0, spaceAfter=2,
    )


def link_tag(label=None):
    text = label if label is not None else APP_URL
    return f'<link href="{APP_URL}" color="#{ACCENT_CSS}"><u>{text}</u></link>'


def img(name, max_width_mm=72, max_height_mm=95):
    path = ASSETS / name
    if not path.exists():
        raise FileNotFoundError(path)
    picture = Image(str(path))
    max_w = max_width_mm * mm
    max_h = max_height_mm * mm
    scale = min(max_w / picture.imageWidth, max_h / picture.imageHeight, 1)
    picture.drawWidth = picture.imageWidth * scale
    picture.drawHeight = picture.imageHeight * scale
    picture.hAlign = "CENTER"
    return picture


def shot_block(s, filename, title, points, max_width_mm=70, max_height_mm=90):
    return KeepTogether([
        Paragraph(title, s["h2"]),
        img(filename, max_width_mm=max_width_mm, max_height_mm=max_height_mm),
        Paragraph(f"Screenshot: {title}", s["caption"]),
        bullets(points, s["bullet"]),
        Spacer(1, 2 * mm),
    ])


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()
    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=11 * mm, bottomMargin=12 * mm,
        title="My Expenses — Illustrated User Guide",
        author=AUTHOR,
        subject="Install with screenshots and screen explanations",
        creator=f"My Expenses guide by {AUTHOR}",
    )
    story = []

    # Cover / link
    story.append(Paragraph("My Expenses", s["title"]))
    story.append(Paragraph("Illustrated user guide — install &amp; screens", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=6))
    story.append(Paragraph("App link (tap to open)", s["link_label"]))
    story.append(Paragraph(link_tag(), s["link_hero"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Not an App Store / Google Play download. Open the link in the correct browser, "
        "then add it to your Home Screen. Photos of the real app and install steps are below.",
        s["note"],
    ))
    story.append(Paragraph(
        f"Developed by <b>{AUTHOR}</b>. Share the app and this guide <b>only with his permission</b>.",
        s["note"],
    ))

    # --- iPhone install ---
    story.append(Paragraph("1. Install on iPhone / iPad (Safari)", s["h1"]))
    story.append(Paragraph(
        "Use <b>Safari only</b>. Chrome / Telegram / WhatsApp in-app browsers usually hide "
        "“Add to Home Screen”.",
        s["body"],
    ))
    story.append(bullets([
        f"<b>1.</b> Open {link_tag('the app link')} — if needed, choose <b>Open in Safari</b>.",
        "<b>2.</b> Wait until the page loads.",
        "<b>3–4.</b> Tap <b>Share</b>, then <b>Add to Home Screen</b> → <b>Add</b>.",
        "<b>5.</b> Open the new Home Screen icon from now on (full-screen app).",
    ], s["bullet"]))
    story.append(img("iphone-tap-share.png", max_width_mm=55, max_height_mm=85))
    story.append(Paragraph("Illustration: tap Share in Safari", s["caption"]))
    story.append(img("iphone-share-add-home.png", max_width_mm=55, max_height_mm=85))
    story.append(Paragraph("Illustration: choose Add to Home Screen", s["caption"]))

    story.append(PageBreak())
    # --- Android install ---
    story.append(Paragraph("2. Install on Android (Chrome)", s["h1"]))
    story.append(Paragraph(
        "Prefer <b>Google Chrome</b>. Avoid opening the link only inside Telegram / Instagram.",
        s["body"],
    ))
    story.append(bullets([
        f"<b>1.</b> Open {link_tag('the app link')} in Chrome.",
        "<b>2.</b> Tap menu <b>⋮</b> → <b>Install app</b> or <b>Add to Home screen</b> "
        "(or use the Install banner if shown).",
        "<b>3.</b> Confirm <b>Add</b> / <b>Install</b>.",
        "<b>4.</b> Open <b>My Expenses / Expenses</b> from the Home Screen or app drawer.",
    ], s["bullet"]))
    story.append(img("android-chrome-install.png", max_width_mm=55, max_height_mm=85))
    story.append(Paragraph("Illustration: Chrome menu → Install app", s["caption"]))
    story.append(img("android-home-icon.png", max_width_mm=55, max_height_mm=85))
    story.append(Paragraph("Illustration: open the Home Screen icon afterward", s["caption"]))

    story.append(Paragraph("3. Computer &amp; new phone", s["h1"]))
    story.append(Paragraph(
        f"<b>Desktop:</b> Chrome/Edge → {link_tag('open the link')} → Install page as app, or bookmark. "
        "<b>New phone:</b> Settings → Backup &amp; export → Export JSON on the old device; "
        "install on the new phone; Settings → Import backup (replaces all data).",
        s["body"],
    ))

    # --- App screens ---
    story.append(PageBreak())
    story.append(Paragraph("4. What’s on each screen", s["title"]))
    story.append(Paragraph("Real app screenshots with labels", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=4))
    story.append(Paragraph(f"Open the app: {link_tag()}", s["link_block"]))

    story.append(shot_block(s, "screen-setup.png", "First-run setup", [
        "<b>Monthly spend budget</b> — how much you plan to spend (may be 0).",
        "<b>Savings</b> — € or % of that budget (0 allowed, not over 100%).",
        "<b>Usual monthly income</b> — what you usually earn (may be 0).",
        "You can change these later in <b>Settings → Plan</b>.",
    ]))

    story.append(shot_block(s, "screen-add.png", "Add (first tab)", [
        "<b>Category</b> + <b>+</b> — pick a category or create a new flexible one.",
        "<b>Subcategory</b> — appears when the category has sub-items.",
        "<b>Amount</b> — expense in euros.",
        "<b>Note</b> + <b>+</b> — optional text; + can save the note as a subcategory.",
        "<b>Date</b> and <b>Add expense</b> — save the entry on this device.",
        "Bottom tabs: Add · Month · Chart · Settings.",
    ]))

    story.append(PageBreak())
    story.append(shot_block(s, "screen-month.png", "Month", [
        "Month navigation and totals for the selected month.",
        "<b>Budget left</b> / cash summary vs your plan and income.",
        "Per-category progress (spent vs limit).",
        "List of expenses (and related entries) for that month.",
    ]))

    story.append(shot_block(s, "screen-chart.png", "Chart", [
        "Donut / breakdown of spending by category for the month.",
        "Use it to see which areas take most of the budget.",
    ]))

    story.append(PageBreak())
    story.append(shot_block(
        s, "screen-settings.png", "Settings (formerly More)",
        [
            "Jump links: Plan · Income · Subscriptions · Categories · Backup.",
            "<b>Plan</b> — monthly spend budget and usual income (0 allowed).",
            "<b>Income</b> — extra income entries and income categories.",
            "<b>Subscriptions</b> — budget share + recurring list (day of month).",
            "<b>Categories</b> — edit plans (flexible/fixed, %/€), Savings, subcategories.",
            "<b>Backup &amp; export</b> — JSON backup import/export and month CSV.",
        ],
        max_width_mm=78, max_height_mm=110,
    ))

    story.append(Paragraph("5. Who this is for", s["h1"]))
    story.append(Paragraph(
        f"Personal use for people who receive access from <b>{AUTHOR}</b>. "
        "Local-only euro tracker — no account, no cloud sync. "
        f"Developed by {AUTHOR}; share only with his permission.",
        s["body"],
    ))

    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(
        f"© {AUTHOR} · My Expenses · Share only with his permission · {link_tag()}",
        s["sub"],
    ))

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Guide", 7.5)
        canvas.drawCentredString(
            A4[0] / 2, 7 * mm,
            f"My Expenses · Illustrated guide · {AUTHOR} · Page {doc_.page}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    pages = len(PdfReader(str(OUT)).pages)
    DESKTOP.write_bytes(OUT.read_bytes())
    print(f"{OUT} ({pages} pages)")
    print(DESKTOP)


if __name__ == "__main__":
    build()
