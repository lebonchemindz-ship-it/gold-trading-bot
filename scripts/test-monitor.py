#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اختبارات وحدة مراقب بوت الذهب — تعمل محلياً دون شبكة
تشغيل: python3 scripts/test-monitor.py
"""
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import monitor as mon  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    mark = "✓" if cond else "✗"
    print(f"{mark} {name}{(' — ' + extra) if extra and not cond else ''}")
    PASS += cond
    FAIL += not cond


def fake_sig(direction="BUY", conf=75, quality=40, price=4400.0, day_high=None, day_low=None):
    return {
        "price": price,
        "direction": direction,
        "confidence": conf,
        "score": 22,
        "mode": "day",
        "session": {"label": "جلسة لندن", "quality": quality},
        "levels": {
            "entry": 4400.0, "sl": 4388.0,
            "tp1": 4412.0, "tp2": 4424.0, "tp3": 4440.0,
            "riskUsd": 12.0, "pips": 120, "rr3": 3.3,
        },
        "dayHigh": day_high,
        "dayLow": day_low,
        "fingerprint": "fp-test",
    }


def fresh_data():
    return {
        "updatedAt": None, "lastCheckedAt": None, "lastSignalAt": None,
        "lastSignalDir": None, "lastLossAt": None,
        "telegram": {}, "telegramEnabled": False, "trades": [],
    }


def main() -> int:
    tmp = Path(tempfile.mkdtemp())
    mon.TRADES_FILE = tmp / "trades.json"

    # ---------- 1) فتح صفقة عند ثقة 75% ----------
    d = fresh_data()
    msgs = mon.try_open_trade(d, fake_sig(conf=75))
    check("فتح صفقة شراء عند ثقة 75%", len(msgs) == 1 and len(d["trades"]) == 1)

    # ---------- 2) رفض عند ثقة أقل من الحد (45 < 55) ----------
    d2 = fresh_data()
    msgs2 = mon.try_open_trade(d2, fake_sig(conf=45))
    check("رفض الفتح عند ثقة 45%", len(msgs2) == 0 and len(d2["trades"]) == 0)

    # ---------- 3) قبول عند الحد تماماً (55 = الحد) ----------
    d3 = fresh_data()
    msgs3 = mon.try_open_trade(d3, fake_sig(conf=55))
    check("قبول الفتح عند الثقة 55% (الحد)", len(msgs3) == 1 and len(d3["trades"]) == 1)

    # ---------- 4) رفض في جلسة ميتة (quality < 25) ----------
    d4 = fresh_data()
    mon.try_open_trade(d4, fake_sig(conf=75, quality=10))
    check("رفض الفتح في جلسة رديئة", len(d4["trades"]) == 0)

    # ---------- 5) إغلاق ربح عند لمس TP ----------
    t = d["trades"][0]
    msgs = mon.check_open_trades(d, fake_sig(conf=60, price=4415.0, day_high=4416.0, day_low=4399.0))
    check(
        "إغلاق ربح عند لمس TP (+1R)",
        t["status"] == "win" and t["resultR"] == 1.0 and len(msgs) == 1,
        f"status={t.get('status')}, resultR={t.get('resultR')}",
    )

    # ---------- 6) إغلاق خسارة عند لمس SL (بيع: الوقف فوق والدخل تحت) ----------
    d6 = fresh_data()
    sell_sig = fake_sig(direction="SELL", conf=70)
    sell_sig["levels"] = {
        "entry": 4400.0, "sl": 4412.0,
        "tp1": 4388.0, "tp2": 4376.0, "tp3": 4360.0,
        "riskUsd": 12.0, "pips": 120, "rr3": 3.0,
    }
    mon.try_open_trade(d6, sell_sig)
    t6 = d6["trades"][0]
    mon.check_open_trades(d6, fake_sig(conf=60, price=4413.0, day_high=4414.0, day_low=4401.0))
    check(
        "إغلاق خسارة عند لمس SL (-1R)",
        t6["status"] == "loss" and t6["resultR"] == -1.0,
        f"status={t6.get('status')}",
    )

    # ---------- 7) الإحصاءات ----------
    st = mon.trade_stats(d6)
    check(
        "الإحصاءات صحيحة",
        st["total"] == 1 and st["losses"] == 1 and st["winRate"] == 0.0,
        json.dumps(st, ensure_ascii=False),
    )

    # ---------- 8) تبريد نفس الاتجاه ----------
    d8 = fresh_data()
    d8["lastSignalDir"] = "BUY"
    d8["lastSignalAt"] = datetime.now(timezone.utc).isoformat()
    mon.try_open_trade(d8, fake_sig(direction="BUY", conf=75))
    check("منع التكرار خلال فترة التبريد", len(d8["trades"]) == 0)

    # ---------- 9) تبريد بعد الخسارة ----------
    d9 = fresh_data()
    d9["lastLossAt"] = datetime.now(timezone.utc).isoformat()
    mon.try_open_trade(d9, fake_sig(conf=75))
    check("منع الفتح بعد خسارة حديثة", len(d9["trades"]) == 0)

    # ---------- 10) إغلاق زمني ----------
    d10 = fresh_data()
    mon.try_open_trade(d10, fake_sig(conf=75))
    t10 = d10["trades"][0]
    t10["openedAt"] = (datetime.now(timezone.utc) - timedelta(hours=27)).isoformat()
    mon.check_open_trades(d10, fake_sig(conf=60, price=4404.0))
    check(
        "إغلاق زمني بعد 26 ساعة",
        t10["status"] == "timeout" and t10["resultR"] is not None,
        f"status={t10.get('status')}, resultR={t10.get('resultR')}",
    )

    # ---------- 11) اكتشاف chat_id تيليجرام من getUpdates ----------
    orig_discover = mon.discover_chat_id
    mon.discover_chat_id = lambda: {"chatId": "111222333", "username": "tester"}
    d11 = fresh_data()
    chat = mon.resolve_tg_chat(d11)
    mon.discover_chat_id = orig_discover
    check(
        "اكتشاف chat_id تلقائياً وحفظه",
        chat == "111222333" and d11["telegram"]["chatId"] == "111222333",
    )

    # ---------- 12) الحفظ والتحميل ----------
    mon.save_trades(d11)
    loaded = mon.load_trades()
    check("الحفظ والتحميل (disk round-trip)", loaded["telegram"]["chatId"] == "111222333")

    print(f"\nالنتيجة: {PASS}/{PASS + FAIL} اختبارات ناجحة")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
