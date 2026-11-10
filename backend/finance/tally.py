"""
tally.py — turns what the Tally Connector sends into the figures on the Finance page.

The connector (running on the finance PC) asks Tally for:
  • groups  : every account group's closing balance at each month-end of this financial year, and today
  • ledgers : every ledger's closing balance today, and at the end of last month
and sends the raw Tally XML here. All the maths happens on the server, so it can be fixed
without reinstalling anything on the finance PC.

Tally XML signs: debit balances are negative, credit balances are positive.
"""
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime

# Tally's built-in groups (by their reserved name), and what each means on the Finance page
CLASSES = {
    "sales accounts": "sales", "purchase accounts": "purchases",
    "direct expenses": "direct_exp", "expenses (direct)": "direct_exp",
    "indirect expenses": "indirect_exp", "expenses (indirect)": "indirect_exp",
    "direct incomes": "direct_inc", "income (direct)": "direct_inc",
    "indirect incomes": "indirect_inc", "income (indirect)": "indirect_inc",
    "sundry debtors": "debtors", "sundry creditors": "creditors",
    "bank accounts": "bank", "cash-in-hand": "cash", "bank od a/c": "od", "bank occ a/c": "od",
    "duties & taxes": "taxes",
}
PL_CLASSES = ("sales", "purchases", "direct_exp", "indirect_exp", "direct_inc", "indirect_inc")

_BAD_REFS = re.compile(r"&#(?:x0*[0-8bcef]|x0*1[0-9a-f]|0*[0-8]|0*1[124-9]|0*2[0-9]|0*3[01]);", re.I)
_BAD_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def _parse(xml_text: str) -> ET.Element | None:
    if not xml_text:
        return None
    text = _BAD_CHARS.sub("", _BAD_REFS.sub("", xml_text))
    try:
        return ET.fromstring(text.encode("utf-8"))
    except ET.ParseError:
        return None


def amount(text: str | None) -> float:
    """'-12,500.00' → -12500.0. Foreign-currency amounts end with '= ₹ value'; take that value."""
    if not text:
        return 0.0
    part = text.split("=")[-1]
    m = _NUM.search(part)
    if not m:
        return 0.0
    try:
        v = float(m.group(0).replace(",", ""))
    except ValueError:
        return 0.0
    # "= -₹ 8300" style: the minus can sit before the currency sign
    if v > 0 and re.search(r"-\s*\D{0,3}\s*" + re.escape(m.group(0)), part):
        v = -v
    return v


def _text(el: ET.Element, tag: str) -> str:
    c = el.find(tag)
    return (c.text or "").strip() if c is not None and c.text else ""


def read_groups(xml_text: str) -> dict:
    """{name: {"reserved", "parent", "closing"}}"""
    root = _parse(xml_text)
    out = {}
    if root is None:
        return out
    for g in root.iter("GROUP"):
        name = (g.get("NAME") or _text(g, "NAME")).strip()
        if not name:
            continue
        out[name] = {"reserved": (g.get("RESERVEDNAME") or "").strip(), "parent": _text(g, "PARENT").replace("Primary", "").strip(),
                     "closing": amount(_text(g, "CLOSINGBALANCE"))}
    return out


def read_ledgers(xml_text: str) -> dict:
    """{name: {"parent", "closing"}}"""
    root = _parse(xml_text)
    out = {}
    if root is None:
        return out
    for l in root.iter("LEDGER"):
        name = (l.get("NAME") or _text(l, "NAME")).strip()
        if not name:
            continue
        out[name] = {"parent": _text(l, "PARENT").replace("Primary", "").strip(), "closing": amount(_text(l, "CLOSINGBALANCE"))}
    return out


def _class_of_group(name: str, groups: dict, seen=None) -> str | None:
    seen = seen or set()
    if not name or name in seen:
        return None
    seen.add(name)
    g = groups.get(name, {})
    for key in (g.get("reserved", ""), name):
        c = CLASSES.get(key.lower())
        if c:
            return c
    return _class_of_group(g.get("parent", ""), groups, seen)


def _pl_totals(groups: dict) -> dict:
    """Year-to-date totals for the profit & loss groups, as positive numbers."""
    t = {c: 0.0 for c in PL_CLASSES}
    for name, g in groups.items():
        own = CLASSES.get(g["reserved"].lower()) or CLASSES.get(name.lower())
        if own in PL_CLASSES:
            # Count each class once: only the top group of that class, not its sub-groups
            parent_class = _class_of_group(g["parent"], groups) if g["parent"] else None
            if parent_class == own:
                continue
            v = g["closing"]
            t[own] += v if own in ("sales", "direct_inc", "indirect_inc") else -v
    return t


def _pl(t: dict) -> dict:
    costs = t["purchases"] + t["direct_exp"]
    gross = t["sales"] + t["direct_inc"] - costs
    net = gross + t["indirect_inc"] - t["indirect_exp"]
    return {
        "sales": round(t["sales"], 2), "direct_costs": round(costs, 2), "gross_profit": round(gross, 2),
        "gross_margin": round(gross / t["sales"], 4) if t["sales"] else None,
        "indirect_expenses": round(t["indirect_exp"], 2), "other_income": round(t["direct_inc"] + t["indirect_inc"], 2),
        "net_profit": round(net, 2), "net_margin": round(net / t["sales"], 4) if t["sales"] else None,
    }


def _minus(a: dict, b: dict) -> dict:
    return {k: a[k] - b.get(k, 0.0) for k in a}


def _ymd(s: str) -> date:
    return datetime.strptime(s, "%Y%m%d").date()


def summarise(payload: dict) -> dict:
    """Build the Finance page summary from one connector upload."""
    snaps = sorted(payload.get("groups") or [], key=lambda s: s.get("to", ""))
    if not snaps:
        raise ValueError("No figures from Tally")
    parsed = [(s["to"], read_groups(s.get("xml", ""))) for s in snaps]
    parsed = [(d, g) for d, g in parsed if g]
    if not parsed:
        raise ValueError("Tally's answer couldn't be read")
    latest_groups = parsed[-1][1]
    today = _ymd(parsed[-1][0])

    # Month by month: cumulative year-to-date totals at each month-end, differenced
    trend, prev_cum = [], {c: 0.0 for c in PL_CLASSES}
    for d, groups in parsed:
        cum = _pl_totals(groups)
        m = _pl(_minus(cum, prev_cum))
        dd = _ymd(d)
        trend.append({"month": dd.strftime("%Y-%m"), "label": dd.strftime("%b"), **m})
        prev_cum = cum
    fy = _pl(_pl_totals(latest_groups))
    month = trend[-1]
    prev_month = trend[-2] if len(trend) > 1 else None

    # Balances today, ledger by ledger
    ledgers = read_ledgers(payload.get("ledgers_now", ""))
    ledgers_prev = read_ledgers(payload.get("ledgers_prev_month", "")) if payload.get("ledgers_prev_month") else {}
    debtors, creditors, cash, expenses, taxes = [], [], [], [], 0.0
    for name, l in ledgers.items():
        c = _class_of_group(l["parent"], latest_groups)
        v = l["closing"]
        if c == "debtors" and abs(v) >= 1:
            debtors.append({"name": name, "amount": round(-v, 2)})
        elif c == "creditors" and abs(v) >= 1:
            creditors.append({"name": name, "amount": round(v, 2)})
        elif c in ("bank", "cash", "od"):
            cash.append({"name": name, "amount": round(-v, 2), "kind": {"bank": "Bank", "cash": "Cash", "od": "Overdraft"}[c]})
        elif c in ("direct_exp", "indirect_exp", "purchases"):
            moved = -v - (-(ledgers_prev.get(name, {}).get("closing", 0.0)) if ledgers_prev else 0.0)
            if not ledgers_prev and today.month != 4:
                moved = 0.0  # without last month's figures this month's spend can't be told apart
            if moved >= 1:
                expenses.append({"name": name, "amount": round(moved, 2), "kind": {"purchases": "Supplier costs", "direct_exp": "Direct", "indirect_exp": "Running costs"}[c]})
        elif c == "taxes":
            taxes += v

    owed_to_us = [d for d in debtors if d["amount"] > 0]
    we_owe = [c for c in creditors if c["amount"] > 0]
    return {
        "company": payload.get("company") or "",
        "as_of": today.isoformat(),
        "fy_label": f"FY {_fy_start(today).year}–{str(_fy_start(today).year + 1)[2:]}",
        "month": month, "prev_month": prev_month, "fy": fy, "trend": trend,
        "receivables": {"total": round(sum(d["amount"] for d in owed_to_us), 2), "count": len(owed_to_us),
                        "top": sorted(owed_to_us, key=lambda x: -x["amount"])[:10],
                        "advances": round(-sum(d["amount"] for d in debtors if d["amount"] < 0), 2)},
        "payables": {"total": round(sum(c["amount"] for c in we_owe), 2), "count": len(we_owe),
                     "top": sorted(we_owe, key=lambda x: -x["amount"])[:10],
                     "advances": round(-sum(c["amount"] for c in creditors if c["amount"] < 0), 2)},
        "cash": {"total": round(sum(a["amount"] for a in cash), 2), "accounts": sorted(cash, key=lambda x: -x["amount"])},
        "expenses_month": sorted(expenses, key=lambda x: -x["amount"])[:10],
        "taxes_payable": round(taxes, 2),
    }


def _fy_start(d: date) -> date:
    return date(d.year if d.month >= 4 else d.year - 1, 4, 1)
