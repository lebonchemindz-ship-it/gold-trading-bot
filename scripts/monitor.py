#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مراقب بوت الذهب — يعمل تلقائياً عبر GitHub Actions كل 10 دقائق (24/5)
====================================================================
- يجلب التوقع الحي من الموقع المنشور (Vercel)
- يفتح صفقة جديدة عند إشارة قوية (ثقة >= 65%) ويسجلها في data/trades.json
- يتابع الصفقات المفتوحة حتى تلمس TP (ربح) أو SL (خسارة)
- يغلق زمنياً بعد 26 ساعة
- يرسل إشعارات تيليجرام فورية (إن وُجد الرمزان)
- يحفظ كل شيء في المستودع → يظهر في «سجل الصفقات» بالموقع
"""

import json
import os
import sys
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ---------- الإعدادات ----------
SIGNAL_URL = os.environ.get(
    "SIGNAL_URL",
    "https://gold-trading-bot-omega.vercel.app/api/signal?mode=day",
)
TRADES_FILE = Path("data/trades.json")
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

MIN_CONFIDENCE = int(os.environ.get("MIN_CONFIDENCE", "55"))  # الحد الأدنى للثقة (محرك الإشارات يعطي 58-70% للإشارات القابلة للتنفيذ)
MIN_SESSION_QUALITY = 25   # جودة جلسة دنيا (تجنب الساعات الميتة)
MAX_OPEN_TRADES = 2        # أقصى صفقات متزامنة
MAX_PER_DIRECTION = 1      # أقصى صفقة واحدة لكل اتجاه
SAME_DIR_COOLDOWN_H = 3.0  # ساعات بين صفقتين بنفس الاتجاه
LOSS_COOLDOWN_H = 2.0      # توقف بعد خسارة
TRADE_TIMEOUT_H = 26.0     # إغلاق زمني
HEARTBEAT_H = 3.0          # تحديث «آخر فحص» كل 3 ساعات حتى لو لا تغييرات


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat(timespec="seconds").replace("+00:00", "Z")


def hours_since(iso) -> float:
    if not iso:
        return 9999.0
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return (now_utc() - dt).total_seconds() / 3600.0
    except ValueError:
        return 9999.0


def fmt_time_ar(iso: str) -> str:
    """تحويل وقت UTC إلى صيغة عربية قصيرة (بتوقيت الجزائر UTC+1)"""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        alg_minutes = (dt.hour * 60 + dt.minute) + 60  # الجزائر UTC+1
        h = int(alg_minutes // 60) % 24
        m = int(alg_minutes % 60)
        days = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
        return f"{days[dt.weekday()]} {h:02d}:{m:02d}"
    except Exception:
        return iso or "-"


# ---------- الشبكة ----------
def fetch_signal(retries: int = 2) -> dict:
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                SIGNAL_URL, headers={"User-Agent": "gold-bot-monitor/1.0"}
            )
            with urllib.request.urlopen(req, timeout=50) as r:
                payload = json.load(r)
            return payload.get("data") or {}
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"[محاولة {attempt + 1}] فشل جلب الإشارة: {e}", file=sys.stderr)
    raise RuntimeError(f"تعذر جلب الإشارة من الموقع: {last_err}")


def send_tg(text: str, chat_id: str = "") -> bool:
    target = (chat_id or TG_CHAT).strip()
    if not TG_TOKEN or not target:
        print("[تيليجرام] غير مُكوَّن — تم تخطي الإشعار (الصفقة محفوظة في السجل)")
        return False
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    body = json.dumps({"chat_id": target, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"[تيليجرام] ✓ أُرسل الإشعار ({r.status})")
            return True
    except Exception as e:  # noqa: BLE001
        print(f"[تيليجرام] ✗ فشل الإرسال: {e}", file=sys.stderr)
    return False


def discover_chat_id() -> dict | None:
    """اكتشاف تلقائي لمعرف المحادثة من آخر الرسائل الواصلة للبوت.
    يتطلب أن يكون المستخدم قد أرسل /start للبوت مرة واحدة."""
    if not TG_TOKEN:
        return None
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/getUpdates",
            headers={"User-Agent": "gold-bot-monitor/1.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            result = (json.load(r) or {}).get("result") or []
    except Exception as e:  # noqa: BLE001
        print(f"[تيليجرام] تعذر جلب الرسائل للاكتشاف: {e}", file=sys.stderr)
        return None
    for u in reversed(result):  # الأحدث أولاً
        chat = (u.get("message") or {}).get("chat") or {}
        if chat.get("type") == "private" and chat.get("id"):
            return {
                "chatId": str(chat["id"]),
                "username": chat.get("username") or chat.get("first_name") or "",
            }
    return None


def resolve_tg_chat(data: dict) -> str:
    """معرف المحادثة: من السر أولاً، ثم السجل المحفوظ، ثم اكتشاف تلقائي"""
    if TG_CHAT:
        data.setdefault("telegram", {})["chatId"] = TG_CHAT
        return TG_CHAT
    tg = data.setdefault("telegram", {})
    if tg.get("chatId"):
        return tg["chatId"]
    found = discover_chat_id()
    if found:
        tg.update(found)
        tg["linkedAt"] = iso_now()
        return tg["chatId"]
    return ""


# ---------- التخزين ----------
def load_trades() -> dict:
    if TRADES_FILE.exists():
        try:
            return json.loads(TRADES_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("تحذير: ملف الصفقات تالف — يبدأ من جديد (نسخة احتياطية محفوظة)")
            TRADES_FILE.rename(TRADES_FILE.with_suffix(".json.bak"))
    return {
        "updatedAt": None,
        "lastCheckedAt": None,
        "lastSignalAt": None,
        "lastSignalDir": None,
        "lastLossAt": None,
        "telegram": {},
        "telegramEnabled": False,
        "trades": [],
    }


def save_trades(data: dict) -> None:
    TRADES_FILE.parent.mkdir(parents=True, exist_ok=True)
    TRADES_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------- منطق الصفقات ----------
def trade_stats(data: dict) -> dict:
    trades = data.get("trades", [])
    closed = [t for t in trades if t.get("status") != "open"]
    wins = [t for t in closed if t.get("status") == "win"]
    losses = [t for t in closed if t.get("status") == "loss"]
    total_r = sum(t.get("resultR") or 0 for t in closed)
    return {
        "total": len(trades),
        "open": len(trades) - len(closed),
        "wins": len(wins),
        "losses": len(losses),
        "winRate": round(100 * len(wins) / len(closed), 1) if closed else None,
        "totalR": round(total_r, 1),
    }


def close_trade_message(t: dict, kind: str, result_r: float, st: dict) -> str:
    dir_ar = "شراء" if t["direction"] == "BUY" else "بيع"
    emoji = "✅" if kind == "win" else ("❌" if kind == "loss" else "⏹️")
    title = {
        "win": "ربح! الهدف تحقق 🎯",
        "loss": "خسارة — لمس وقف الخسارة",
        "timeout": "إغلاق زمني (انتهت مهلة 26 ساعة)",
    }[kind]
    r_str = f"{'+' if result_r >= 0 else ''}{result_r:.1f}R"
    usd = (t.get("riskUsd") or 0) * result_r
    wr = f"{st['winRate']}%" if st["winRate"] is not None else "-"
    lines = [
        f"{emoji} {title}",
        f"صفقة {dir_ar} XAU/USD — {fmt_time_ar(t['openedAt'])}",
        f"الدخول: {t['entry']}$ → الإغلاق: {round(t.get('closePrice') or 0, 1)}$",
        f"النتيجة: {r_str} ({'+' if usd >= 0 else ''}{usd:.1f}$ لكل أونصة)",
        f"📊 إحصائية البوت الآلي: فوز {wr} ({st['wins']}ر/{st['losses']}خ) · صافي {st['totalR']}R",
    ]
    return "\n".join(lines)


def new_trade_message(t: dict) -> str:
    dir_ar = "شراء" if t["direction"] == "BUY" else "بيع"
    emoji = "🟢" if t["direction"] == "BUY" else "🔴"
    lines = [
        f"{emoji} صفقة ذهب جديدة — {dir_ar} XAU/USD",
        f"🎯 الثقة: {t['confidence']}% | الدرجة: {'+' if (t.get('score') or 0) >= 0 else ''}{t.get('score')}",
        f"💰 الدخول: {t['entry']}$",
        f"🛑 الوقف: {t['sl']}$ (خطر {t['riskUsd']}$)",
        f"🎯 الأهداف: {t['tp1']}$ / {t['tp2']}$ / {t['tp3']}$",
        f"🕓 الجلسة: {t.get('sessionLabel', '-')}",
        "",
        "🤖 سيتابعها البوت تلقائياً وسيرسل النتيجة عند TP أو SL — لا حاجة لفتح الموقع",
    ]
    return "\n".join(lines)


def check_open_trades(data: dict, sig: dict) -> list:
    """متابعة الصفقات المفتوحة ضد السعر الحي. يعيد رسائل الإغلاق."""
    messages = []
    price = sig.get("price")
    if price is None:
        return messages

    day_high = sig.get("dayHigh")
    day_low = sig.get("dayLow")
    today = now_utc().date().isoformat()

    for t in data.get("trades", []):
        if t.get("status") != "open":
            continue

        # مدى اليوم يساعد على التقاط لمسات TP/SL بين الفحوص (لصفقات اليوم فقط)
        opened_today = str(t.get("openedAt") or "")[:10] == today
        hi = price
        lo = price
        if opened_today and day_high:
            hi = max(hi, day_high)
        if opened_today and day_low:
            lo = min(lo, day_low)

        kind = None
        close_price = None
        if t["direction"] == "BUY":
            if hi >= t["tp1"]:
                kind, close_price = "win", t["tp1"]
            elif lo <= t["sl"]:
                kind, close_price = "loss", t["sl"]
        else:  # SELL
            if lo <= t["tp1"]:
                kind, close_price = "win", t["tp1"]
            elif hi >= t["sl"]:
                kind, close_price = "loss", t["sl"]

        # مهلة زمنية — أغلق بالسعر الحالي
        if kind is None and hours_since(t.get("openedAt")) >= TRADE_TIMEOUT_H:
            kind = "timeout"
            close_price = price

        if kind is None:
            continue

        if kind == "win":
            result_r = 1.0
        elif kind == "loss":
            result_r = -1.0
        else:
            raw = (close_price - t["entry"]) / max(t.get("riskUsd") or 0.01, 0.01)
            result_r = round(raw * (1 if t["direction"] == "BUY" else -1), 2)

        t["status"] = kind
        t["closedAt"] = iso_now()
        t["closePrice"] = round(close_price, 1)
        t["resultR"] = result_r
        if kind == "loss":
            data["lastLossAt"] = t["closedAt"]

        st = trade_stats(data)
        messages.append(close_trade_message(t, kind, result_r, st))
    return messages


def try_open_trade(data: dict, sig: dict) -> list:
    """فتح صفقة جديدة إذا توفرت إشارة قوية. يعيد رسالة الصفقة الجديدة."""
    direction = sig.get("direction")
    levels = sig.get("levels")
    if direction not in ("BUY", "SELL") or not levels:
        return []

    session = sig.get("session") or {}
    market_closed = (session.get("quality") == 0) and ("مغلق" in (session.get("label") or ""))
    if market_closed:
        return []

    confidence = sig.get("confidence") or 0
    if confidence < MIN_CONFIDENCE:
        if direction != "WAIT":
            print(f"[رفض] إشارة {direction} بثقة {confidence}% — الحد الأدنى {MIN_CONFIDENCE}%")
        return []
    if (session.get("quality") or 0) < MIN_SESSION_QUALITY:
        return []

    trades = data.get("trades", [])
    open_trades = [t for t in trades if t.get("status") == "open"]
    same_dir = [t for t in open_trades if t["direction"] == direction]

    if len(open_trades) >= MAX_OPEN_TRADES:
        return []
    if len(same_dir) >= MAX_PER_DIRECTION:
        return []
    if hours_since(data.get("lastLossAt")) < LOSS_COOLDOWN_H:
        print(f"[توقف] خسارة حديثة — انتظار {LOSS_COOLDOWN_H} ساعة")
        return []
    if (
        data.get("lastSignalDir") == direction
        and hours_since(data.get("lastSignalAt")) < SAME_DIR_COOLDOWN_H
    ):
        print(f"[توقف] إشارة {direction} حديثة — انتظار {SAME_DIR_COOLDOWN_H} ساعة")
        return []

    opened_at = iso_now()
    trade = {
        "id": f"t{int(now_utc().timestamp())}-{uuid.uuid4().hex[:6]}",
        "openedAt": opened_at,
        "mode": sig.get("mode", "day"),
        "direction": direction,
        "entry": levels.get("entry"),
        "sl": levels.get("sl"),
        "tp1": levels.get("tp1"),
        "tp2": levels.get("tp2"),
        "tp3": levels.get("tp3"),
        "riskUsd": levels.get("riskUsd"),
        "confidence": confidence,
        "score": sig.get("score"),
        "fingerprint": sig.get("fingerprint"),
        "sessionLabel": session.get("label", "-"),
        "status": "open",
        "closedAt": None,
        "closePrice": None,
        "resultR": None,
    }
    data.setdefault("trades", []).append(trade)
    data["lastSignalAt"] = opened_at
    data["lastSignalDir"] = direction
    return [new_trade_message(trade)]


# ---------- التشغيل الرئيسي ----------
def main() -> int:
    print(f"=== مراقب بوت الذهب — {iso_now()} ===")
    sig = fetch_signal()
    data = load_trades()

    # ربط تيليجرام: سر، أو محفوظ، أو اكتشاف تلقائي (أول /start من المستخدم)
    tg = data.setdefault("telegram", {})
    had_chat = bool(tg.get("chatId"))
    chat = resolve_tg_chat(data)
    newly_linked = bool(chat) and not had_chat
    if newly_linked:
        print(f"[تيليجرام] ✓ ربط ناجح: {tg.get('username') or tg.get('chatId')}")
        send_tg(
            "✅ تم ربط تيليجرام — البوت الآلي يعمل الآن على مدار الساعة\n"
            "📩 سيصلك إشعار فوري عند: فتح صفقة جديدة · تحقق الهدف 🎯 · لمس الوقف 🛑\n"
            "📜 سجل الصفقات: https://gold-trading-bot-omega.vercel.app",
            chat,
        )
    data["telegramEnabled"] = bool(TG_TOKEN and chat)

    session = sig.get("session") or {}
    print(
        f"السعر: {sig.get('price')} | الاتجاه: {sig.get('direction')} | "
        f"الثقة: {sig.get('confidence')}% | الجلسة: {(session.get('label') or '-')[:60]}"
    )

    events = []
    events.extend(check_open_trades(data, sig))
    events.extend(try_open_trade(data, sig))

    changed = bool(events) or newly_linked
    heartbeat_due = hours_since(data.get("lastCheckedAt")) >= HEARTBEAT_H

    if changed or heartbeat_due:
        data["lastCheckedAt"] = iso_now()
        if changed:
            data["updatedAt"] = iso_now()
        save_trades(data)
        print(f"حُفظ الملف: {len(events)} حدث | {json.dumps(trade_stats(data), ensure_ascii=False)}")
    else:
        print("لا تغييرات — الصفقات المفتوحة تحت المراقبة")

    for msg in events:
        print("— إشعار —")
        print(msg)
        send_tg(msg, chat)

    print("=== انتهى ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
