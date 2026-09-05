"""Build illustrated My Expenses user guide PDF (screenshot left, tips right)."""

from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
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
    Table,
    TableStyle,
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
PANEL = HexColor("#f8fafc")


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
            leading=13, textColor=ACCENT, spaceBefore=0, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Guide", fontSize=9,
            leading=11.5, textColor=INK, alignment=TA_LEFT, spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["Normal"], fontName="Guide", fontSize=8.5,
            leading=11, textColor=INK,
        ),
        "side_label": ParagraphStyle(
            "side_label", parent=base["Normal"], fontName="Guide-Bold", fontSize=8,
            leading=10, textColor=MUTED, spaceBefore=1, spaceAfter=1,
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
        [ListItem(Paragraph(item, style), leftIndent=6, value="•") for item in items],
        bulletType="bullet", start="•", leftIndent=10,
        bulletFontName="Guide", bulletFontSize=8.5, spaceBefore=0, spaceAfter=1,
    )


def link_tag(label=None):
    text = label if label is not None else APP_URL
    return f'<link href="{APP_URL}" color="#{ACCENT_CSS}"><u>{text}</u></link>'


def img(name, max_width_mm=68, max_height_mm=105):
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


def side_by_side(s, filename, title, see_points, do_points, max_width_mm=62, max_height_mm=100):
    """Screenshot on the left; what you see / can do on the right."""
    right = [
        Paragraph(title, s["h2"]),
        Paragraph("What you see", s["side_label"]),
        bullets(see_points, s["bullet"]),
        Spacer(1, 2 * mm),
        Paragraph("What you can do", s["side_label"]),
        bullets(do_points, s["bullet"]),
    ]
    left_w = 70 * mm
    right_w = 110 * mm
    table = Table(
        [[img(filename, max_width_mm=max_width_mm, max_height_mm=max_height_mm), right]],
        colWidths=[left_w, right_w],
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm),
        ("LEFTPADDING", (1, 0), (1, 0), 2 * mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BACKGROUND", (1, 0), (1, 0), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LINEBEFORE", (1, 0), (1, 0), 0.4, LINE),
    ]))
    return KeepTogether([table, Spacer(1, 3.5 * mm)])


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()
    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=10 * mm, bottomMargin=12 * mm,
        title="My Expenses — Illustrated User Guide",
        author=AUTHOR,
        subject="Install steps and screen-by-screen guide",
        creator=f"My Expenses guide by {AUTHOR}",
    )
    story = []

    # Cover
    story.append(Paragraph("My Expenses", s["title"]))
    story.append(Paragraph("User guide — install &amp; every screen", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=6))
    story.append(Paragraph("App link (tap to open)", s["link_label"]))
    story.append(Paragraph(link_tag(), s["link_hero"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Local-only euro tracker for income and spending. No account and no cloud sync — "
        "everything stays on this device. Not an App Store / Google Play download: open the "
        "link in the right browser, then add it to your Home Screen.",
        s["note"],
    ))
    story.append(Paragraph(
        f"Developed by <b>{AUTHOR}</b>. Share the app and this guide <b>only with his permission</b>.",
        s["note"],
    ))

    # Install iPhone
    story.append(Paragraph("1. Install on iPhone / iPad (Safari)", s["h1"]))
    story.append(Paragraph(
        "Use <b>Safari only</b>. Chrome and in-app browsers (Telegram, WhatsApp) usually hide "
        "“Add to Home Screen”.",
        s["body"],
    ))
    story.append(side_by_side(
        s, "iphone-tap-share.png", "Step A — Share",
        [
            "Safari address bar and toolbar at the bottom.",
            "The square <b>Share</b> icon (arrow pointing up).",
        ],
        [
            f"Open {link_tag('the app link')} — choose <b>Open in Safari</b> if asked.",
            "Wait until the page loads.",
            "Tap <b>Share</b>.",
        ],
        max_width_mm=52, max_height_mm=88,
    ))
    story.append(side_by_side(
        s, "iphone-share-add-home.png", "Step B — Add to Home Screen",
        [
            "The iOS share sheet with app actions.",
            "The row <b>Add to Home Screen</b>.",
        ],
        [
            "Scroll the sheet if needed and tap <b>Add to Home Screen</b>.",
            "Confirm the name, then tap <b>Add</b>.",
            "From now on, open the new Home Screen icon (full-screen app).",
        ],
        max_width_mm=52, max_height_mm=88,
    ))

    story.append(PageBreak())
    # Install Android
    story.append(Paragraph("2. Install on Android (Chrome)", s["h1"]))
    story.append(Paragraph(
        "Prefer <b>Google Chrome</b>. Avoid opening the link only inside Telegram or Instagram.",
        s["body"],
    ))
    story.append(side_by_side(
        s, "android-chrome-install.png", "Step A — Install from Chrome",
        [
            "Chrome’s menu (<b>⋮</b>) or an Install banner.",
            "Options like <b>Install app</b> or <b>Add to Home screen</b>.",
        ],
        [
            f"Open {link_tag('the app link')} in Chrome.",
            "Tap menu <b>⋮</b> → <b>Install app</b> / <b>Add to Home screen</b> "
            "(or the Install banner).",
            "Confirm <b>Add</b> / <b>Install</b>.",
        ],
        max_width_mm=52, max_height_mm=88,
    ))
    story.append(side_by_side(
        s, "android-home-icon.png", "Step B — Open the icon",
        [
            "A Home Screen or app-drawer icon for My Expenses / Expenses.",
        ],
        [
            "Open that icon instead of a browser tab.",
            "You’ll get a full-screen app with offline support after the first load.",
        ],
        max_width_mm=52, max_height_mm=88,
    ))

    story.append(Paragraph("3. Computer &amp; new phone", s["h1"]))
    story.append(Paragraph(
        f"<b>Desktop:</b> Chrome/Edge → {link_tag('open the link')} → Install page as app, or bookmark. "
        "<b>New phone:</b> on the old device go to Settings → Backup &amp; export → Export JSON; "
        "install on the new phone; Settings → Import backup (this replaces all data on that device).",
        s["body"],
    ))

    # Screens
    story.append(PageBreak())
    story.append(Paragraph("4. What’s on each screen", s["title"]))
    story.append(Paragraph("Screenshot on the left · what you see / can do on the right", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=4))
    story.append(Paragraph(f"Open the app: {link_tag()}", s["link_block"]))

    story.append(side_by_side(
        s, "screen-setup.png", "First-run setup",
        [
            "<b>Your name</b> — used to personalise Home.",
            "<b>Monthly spend budget</b> field (euros; 0 allowed).",
            "<b>Savings</b> as € or % of that budget.",
            "<b>Usual monthly income</b> field (euros; 0 allowed).",
            "A continue / save control at the bottom.",
        ],
        [
            "Enter your name (you can change it later in Settings → Plan).",
            "Enter how much you plan to spend each month.",
            "Set Savings (0 is fine; cannot go over 100% of the budget).",
            "Enter usual income — counted automatically every month later.",
            "Save to open the app.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-home.png", "Home (first tab)",
        [
            "Greeting with your name (for example <b>Hi, Alex</b>).",
            "Short intro that also uses your name.",
            "Note that usual salary (Plan) and subscription reminders run automatically.",
            "Two big buttons: <b>Add expense</b> and <b>Add extra income</b>.",
            "Bottom tabs: Home · Month · Chart · Settings.",
        ],
        [
            "Tap <b>Add expense</b> for day-to-day spending.",
            "Tap <b>Add extra income</b> for bonus, gift, side job — not regular salary.",
            "Change your name anytime in <b>Settings → Plan</b>.",
            "Use Month / Chart / Settings tabs for overview and setup.",
        ],
    ))

    story.append(PageBreak())
    story.append(side_by_side(
        s, "screen-expense.png", "Add expense",
        [
            "Category picker and optional <b>+</b> to create a flexible category.",
            "Subcategory when the category has sub-items.",
            "Amount (euros), optional note (+ can save note as subcategory), and date.",
            "<b>Add expense</b> button and <b>Back to Home</b>.",
        ],
        [
            "Choose (or create) a category and subcategory if needed.",
            "Enter the amount and optional note, pick the date, then save.",
            "Use Back to Home when you’re done.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-income.png", "Add extra income",
        [
            "Income category picker and <b>+</b> to create a new income category.",
            "Amount, optional note, and date.",
            "Reminder that usual salary comes from Settings → Plan.",
            "<b>Add extra income</b> and <b>Back to Home</b>.",
        ],
        [
            "Choose a category or tap <b>+</b> to add one (bonus, gift, freelance…).",
            "Log one-off income only — not regular salary.",
            "Save, then return Home — or switch tabs to check Month totals.",
        ],
    ))

    story.append(PageBreak())
    story.append(side_by_side(
        s, "screen-month.png", "Month",
        [
            "Month switcher and totals for the selected month.",
            "Budget left / cash summary vs plan and income.",
            "Per-category progress (spent vs limit).",
            "List of expenses (and related entries) for that month.",
        ],
        [
            "Move between months to review past spending.",
            "Spot which categories are over or under plan.",
            "Open an entry if you need to check details for that month.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-chart.png", "Chart",
        [
            "Two analytics: <b>Spending</b> and <b>Income</b>.",
            "Spending donut by expense category (tap a row to drill into subcategories).",
            "Income donut: usual salary from Plan + extra income by category.",
            "Note: spend budget stays fixed — extra income only raises Cash left.",
        ],
        [
            "Compare which expense areas take most of the budget.",
            "See where money came from this month (Plan salary vs extras).",
            "Switch months with the month navigator at the top.",
        ],
    ))

    story.append(PageBreak())
    story.append(side_by_side(
        s, "screen-settings.png", "Settings",
        [
            "Jump links: Plan · Income · Subscriptions · Categories · Backup.",
            "Plan block for your name, monthly spend budget, and usual income.",
            "Subscriptions: budget share + recurring list (day of month).",
            "Categories editor (Savings is protected) and Backup &amp; export.",
        ],
        [
            "Edit Plan (name, budget / usual income — 0 allowed).",
            "Manage extra-income categories and subscription reminders.",
            "Tune category limits (% or €); Savings stays fixed and ≤ 100% of budget.",
            "Export / import JSON backup, or export a month CSV.",
        ],
        max_width_mm=58, max_height_mm=118,
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
            f"My Expenses · User guide · {AUTHOR} · Page {doc_.page}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    pages = len(PdfReader(str(OUT)).pages)
    DESKTOP.write_bytes(OUT.read_bytes())
    print(f"{OUT} ({pages} pages)")
    print(DESKTOP)


if __name__ == "__main__":
    build()
