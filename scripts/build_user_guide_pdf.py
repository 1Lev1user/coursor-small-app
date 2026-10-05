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
ACCENT_CSS = "1F5C45"

FONT_CANDIDATES = [
    (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ),
]
REGULAR_FONT, BOLD_FONT = next(
    pair for pair in FONT_CANDIDATES if all(Path(path).exists() for path in pair)
)
pdfmetrics.registerFont(TTFont("Guide", REGULAR_FONT))
pdfmetrics.registerFont(TTFont("Guide-Bold", BOLD_FONT))

INK = HexColor("#15201A")
MUTED = HexColor("#44524A")
ACCENT = HexColor("#1F5C45")
LINE = HexColor("#D3DBCF")
SOFT = HexColor("#E6ECE3")
PANEL = HexColor("#F4F7F1")


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
        title="My Expenses - Illustrated User Guide (version 3.0)",
        author=AUTHOR,
        subject="Install steps and screen-by-screen guide",
        creator=f"My Expenses guide by {AUTHOR}",
    )
    story = []

    # Cover
    story.append(Paragraph("My Expenses", s["title"]))
    story.append(Paragraph("User guide - version 3.0: install &amp; every screen", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=6))
    story.append(Paragraph("App link (tap to open)", s["link_label"]))
    story.append(Paragraph(link_tag(), s["link_hero"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Local-only euro tracker for income and spending. It keeps track of the money on your "
        "card: every expense lowers it and every income raises it. No account and no cloud sync - "
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
        s, "iphone-tap-share.png", "Step A - Share",
        [
            "Safari address bar and toolbar at the bottom.",
            "The square <b>Share</b> icon (arrow pointing up).",
        ],
        [
            f"Open {link_tag('the app link')} - choose <b>Open in Safari</b> if asked.",
            "Wait until the page loads.",
            "Tap <b>Share</b>.",
        ],
        max_width_mm=52, max_height_mm=88,
    ))
    story.append(side_by_side(
        s, "iphone-share-add-home.png", "Step B - Add to Home Screen",
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
        s, "android-chrome-install.png", "Step A - Install from Chrome",
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
        s, "android-home-icon.png", "Step B - Open the icon",
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
        "<b>New phone:</b> on the old phone go to Settings → <b>Backup</b> → "
        "<b>Export backup (JSON)</b> and send the file to yourself. Install the app on the new "
        "phone, then Settings → <b>Backup</b> → <b>Import backup</b>, choose the file and tap "
        "<b>Replace everything</b>. Then open Home and check that Money now matches the old phone; "
        "if the app asks you to set up your money, follow the steps on screen.",
        s["body"],
    ))

    # Screens
    story.append(PageBreak())
    story.append(Paragraph("4. What’s on each screen", s["title"]))
    story.append(Paragraph("Screenshot on the left · what you see / can do on the right", s["sub"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=LINE, spaceBefore=1, spaceAfter=4))
    story.append(Paragraph(f"Open the app: {link_tag()}", s["link_block"]))

    story.append(side_by_side(
        s, "screen-setup.png", "Getting started: your name and budget",
        [
            "<b>Welcome</b> with <b>Your name</b>, <b>Monthly budget (EUR)</b> and "
            "<b>Savings</b> (switch between € and %).",
            "A line that shows what the Savings number comes to, with a worked example.",
            "The button <b>Continue</b>.",
        ],
        [
            "Enter your name and how much you plan to spend each month (0 is allowed).",
            "Set Savings. It cannot be more than the monthly budget.",
            "Tap <b>Continue</b>. The next screen asks about the money on your card.",
            "You can change the name and the budget later in Settings.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-money-setup.png", "Getting started: set up your money",
        [
            "<b>Set up your money</b> and the question <b>How much is on the card now? (EUR)</b>.",
            "Under <b>Regular income</b>: <b>Name</b>, <b>Expected amount (EUR)</b> and "
            "<b>Payday (day of month)</b>, with <b>Remove</b>.",
            "Further down (scroll): <b>Add another income</b> and <b>Start</b>.",
        ],
        [
            "Type the amount on your card today. A negative amount such as -40.00 is accepted.",
            "Add each regular income, for example a salary, with its usual amount and the day "
            "of the month it arrives. You may leave it empty and add incomes later in Settings.",
            "Tap <b>Start</b> (the app says “Money setup complete”). From now on every expense "
            "lowers Money now and every income raises it. Months before today stay as they are.",
            "After an update from an older version you see this screen once, before Home. If "
            "this month’s income already arrived, add it from Home with <b>Add income</b>.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-home.png", "Home: Money now and the amount per day",
        [
            "Your month with your name (for example <b>Alex’s September</b>).",
            "The big block <b>Money now</b> with “Tap to check against your bank”.",
            "Under it the amount per day, such as “€64.87 a day for 4 days until payday 28 Sep”, "
            "and the line “Month budget: €709.50 left to spend · €290.50 spent of €1,000.00”.",
            "<b>Add expense</b> and <b>Add income</b>, then <b>Quick add</b>, <b>Recent</b> and "
            "<b>Open Month</b> further down. Tabs: Home · Month · Chart · Settings.",
        ],
        [
            "Read Money now as the amount that should be on your card right now.",
            "The amount per day is Money now divided by the days until your next payday, or until "
            "the end of the month. If nothing is left it says “Nothing left per day until …”.",
            "Prefer a fixed amount? Settings → <b>Money</b> → <b>Amount per day</b>: choose "
            "<b>Automatic</b> or <b>Fixed amount</b>, then save. Home then shows “€X left of "
            "today’s €Y”.",
            "After money was put into Savings, a line “Put into Savings since …” appears.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-settings-income.png", "Paydays and regular incomes",
        [
            "Settings, group <b>Income</b>, with <b>Regular income</b> open.",
            "Each regular income with its amount, payday and this month’s state (“waiting for "
            "you on Home”, “expected 28 Sep”), and <b>Edit</b> and <b>Delete</b>.",
            "Below it the form <b>Add regular income</b>: <b>Name</b>, <b>Expected amount "
            "(EUR)</b>, payday and income category.",
        ],
        [
            "Add each regular income once. In a month that is too short for the payday, the "
            "last day of the month is used.",
            "On the payday Home shows a card such as “Salary expected today: €2,000.00” (an "
            "earlier missed one reads “expected on 15 Oct”) with <b>Amount received (EUR)</b>. "
            "Change the amount if it differs.",
            "<b>Received</b> records the income. <b>Later</b> hides the card until you reopen "
            "the app. <b>Skip this month</b> leaves it out for this month.",
            "Nothing is added without your tap, and the payday is the exact date you set.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-bank-check.png", "Check against the bank",
        [
            "Money now with the sheet <b>How much is on the card now?</b> open under it.",
            "<b>Amount on the card (EUR)</b> and a live line, here “The app shows €259.50. The "
            "difference -€27.00 is added as an expense in Uncategorised dated today, and counts "
            "in this month.”",
            "<b>Save</b> and <b>Cancel</b>.",
        ],
        [
            "Tap the Money now figure, type the amount your bank shows and read the line "
            "before you save.",
            "If the amounts match, nothing is added (“Matches your bank. Nothing added.”). "
            "Otherwise the app adds the difference: an income in Other if the bank shows more, "
            "an expense in Uncategorised if it shows less.",
            "The difference is one ordinary dated entry with the note “Bank difference”. Edit "
            "or delete it in Month. Past months do not change.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-expense.png", "Adding entries: expense, refund, quick add",
        [
            "<b>Category</b> with <b>+</b> to create one, a <b>Subcategory</b> once the "
            "category has sub-items, and <b>Currency</b>.",
            "<b>Amount (€)</b>, <b>Refund (money back from a shop)</b>, <b>Note (what was "
            "it?)</b> and <b>Date</b>.",
            "<b>Save as template</b> and <b>Add expense</b>.",
        ],
        [
            "Pick the category, enter the amount and tap <b>Add expense</b>. A confirmation "
            "says “Expense added”.",
            "For a foreign purchase choose another currency: enter the amount in that currency "
            "and what your bank charged in EUR.",
            "Tick <b>Refund</b> for money back from a shop. It lowers spending and is marked "
            "Refund.",
            "Tick <b>Save as template</b> and the expense becomes a <b>Quick add</b> button on "
            "Home, like “Coffee · €3.50”. One tap adds it; the message “Added Coffee” has "
            "<b>Undo</b>. Edit templates in Settings → <b>Quick add</b>.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-income.png", "Adding entries: income",
        [
            "A hint: pick the regular income this is, or Other income for a bonus or a gift.",
            "<b>Income from</b>, <b>Income category</b> with <b>+</b>, <b>Amount (€)</b>, "
            "<b>Date</b> and <b>Note (optional)</b>.",
            "<b>Add income</b> and <b>Back to Home</b>.",
        ],
        [
            "Choose a regular income (for example Salary) in <b>Income from</b> to count it as "
            "received for that month. Choose <b>Other income (bonus, gift, ...)</b> for a "
            "one-off.",
            "Enter the amount and the date, then tap <b>Add income</b>. Money now goes up.",
            "Tap <b>+</b> to make a new income category.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-month.png", "Month",
        [
            "Month switcher, <b>Budget left</b> and <b>Cash left</b> (income minus spending "
            "for the month).",
            "“Spent €290.50 of €1,000.00 · Income €350.00”.",
            "“Starts with €200.00 (from 1 Sep) · Ends with €259.50”: Money now at the start "
            "and the end of the month.",
            "One line per regular income, such as “Salary: expected since 20 Sep”; after "
            "you confirm it reads “received”, or “skipped this month”.",
            "<b>Categories</b> with progress, <b>Search all entries</b> and the <b>Entries</b> list.",
        ],
        [
            "Move between months to review the past.",
            "See which categories are over or under their limit.",
            "<b>Edit</b> or <b>Delete</b> an entry. After a delete the message “Deleted” offers "
            "<b>Undo</b>, which brings the entry back.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-chart.png", "Chart: Spending and Income",
        [
            "The switcher <b>Chart view</b>: <b>Spending</b>, <b>Income</b>, <b>Trends</b>, "
            "<b>Year</b>, and the month navigator.",
            "Spending: a donut by category with the total spent, and a row per category with "
            "its planned amount.",
            "The note “The monthly budget stays fixed for this month. Extra income does not "
            "raise it.”",
        ],
        [
            "Tap a category row to open its subcategories. <b>All spending</b> goes back.",
            "Income shows the income you received, by category. It raises Cash left, not the "
            "spending budget. Months from before 3.0 may label part of their income differently.",
            "Year shows totals for the year, and <b>Export the year</b> saves them as a CSV.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-trends.png", "Chart: Trends",
        [
            "A bar for each of the last 12 months, a solid line for the average and a dashed "
            "line for the budget.",
            "The selected month: spent, budget and income.",
            "<b>Show as table</b> and the note “Tap a bar for details”.",
        ],
        [
            "Tap a bar to see that month’s numbers. <b>Show as table</b> gives the same as a table.",
            "The average counts only months that have spending.",
            "When it is shown, the card <b>Changes vs last month</b> lists the categories "
            "that moved most; <b>Show all</b> opens the full list.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-settings.png", "Settings: groups",
        [
            "One page of groups; each row shows a one-line summary, such as “Money now "
            "€259.50”.",
            "In order: <b>Money</b>, <b>Income</b>, <b>Monthly budget</b>, <b>Backup</b>, "
            "<b>Categories and limits</b>, <b>Subscriptions</b>, <b>Quick add</b>, "
            "<b>Goals</b>, <b>Bank import (advanced)</b>, <b>Profile and about</b> (scroll "
            "down to reach the last ones).",
        ],
        [
            "Tap a group to open it. One group is open at a time.",
            "Your name: <b>Profile and about</b> → <b>Save name</b>.",
            "The budget: <b>Monthly budget</b> → <b>Save budget</b>. A budget of 0 asks "
            "“Are you sure?” first.",
            "Savings and category limits: <b>Categories and limits</b>.",
            "Subscriptions are recurring payments with a day of the month.",
        ],
        max_width_mm=58, max_height_mm=118,
    ))

    story.append(side_by_side(
        s, "screen-import.png", "Import a bank statement",
        [
            "The import screen after a file was read: <b>Bank reference (optional)</b>, "
            "<b>Decimal separator</b> and the date format question.",
            "“3 rows are ready to import.”",
            "<b>Check what was read</b>: sample rows, <b>Money in</b>, <b>Money out</b> and "
            "“Rows read: 3, skipped: 0”.",
        ],
        [
            "Settings → <b>Bank import (advanced)</b> → <b>Import a bank statement</b>. The "
            "steps are Load, Columns, Duplicates, Categorise and Confirm.",
            "<b>Choose file</b> (CSV, Excel .xlsx, camt.053 or FiDAViSTA XML) or <b>Paste "
            "text</b>. The file is read on this device and nothing is uploaded.",
            "Look at <b>Check what was read</b> before you go on. If almost every row is money "
            "in, the app warns you: tick <b>Reverse money in and out</b> on the Columns step "
            "(some banks show spending as positive numbers).",
            "Duplicates: <b>Exact</b>, <b>Possible duplicate: added by you</b> and "
            "<b>Possible duplicate: similar amount</b>. Possible duplicates are not imported "
            "unless you tick <b>Import anyway</b>.",
            "For each row <b>What is it?</b> offers Expense, Refund, Income, Transfer or Skip. "
            "Near a payday the app asks “Is this the Salary?” and Yes ties the row to it. "
            "Then tap <b>Import</b>; <b>Undo this import</b> reverses it.",
        ],
    ))

    story.append(side_by_side(
        s, "screen-settings-backup.png", "Backup and restore",
        [
            "Settings, group <b>Backup</b>: <b>Export backup (JSON)</b> and <b>Import backup</b>.",
            "<b>Month CSV</b> with <b>Europe CSV</b> and <b>Standard CSV</b>.",
            "<b>Data from before the last update</b>: <b>Download pre-update copy</b>, "
            "<b>Restore pre-update copy</b> and, below, <b>Delete this copy</b>.",
        ],
        [
            "Export a backup now and then and keep the file safe. Home reminds you (“Last "
            "backup 4 days ago”, or “No backup yet. If this phone is lost, your data is "
            "gone.”) with <b>Export backup</b> and <b>Later</b>.",
            "<b>Import backup</b>: after you choose a file, a preview shows “This file: N "
            "expenses, N incomes, N subscriptions” and the dates it covers. Then choose "
            "<b>Settings only</b> or <b>Replace everything</b> (it cannot be undone), or "
            "Cancel.",
            "Safety copy: <b>Replace everything</b> first downloads your current data as "
            "my-expenses-before-replace-(date).json, then replaces it.",
            "Pre-update copy: <b>Restore pre-update copy</b> asks you to confirm (“Entries "
            "added since the update are removed. Your current data is downloaded first.”), "
            "then tap <b>Restore</b>.",
        ],
        max_width_mm=58, max_height_mm=118,
    ))

    story.append(Paragraph("5. Who this is for", s["h1"]))
    story.append(Paragraph(
        f"Personal use for people who receive access from <b>{AUTHOR}</b>. "
        "Local-only euro tracker - no account, no cloud sync. "
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
    print(f"{OUT} ({pages} pages)")
    if DESKTOP.parent.is_dir():
        DESKTOP.write_bytes(OUT.read_bytes())
        print(DESKTOP)


if __name__ == "__main__":
    build()
