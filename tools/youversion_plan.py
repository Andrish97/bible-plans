#!/usr/bin/env python3
"""
Pobiera 365 dni planu "The One Year Chronological Bible" z bible.com (YouVersion)
i zapisuje listę odnośników do wersetów dla każdego dnia (bez treści wersetów).

Wynik: plik TXT, jedna linia na dzień:
    Dzień 1: Genesis 1; Genesis 2; Genesis 3

Wymagania:
    pip install requests beautifulsoup4

Uruchomienie:
    python3 youversion_plan.py
    python3 youversion_plan.py --start 1 --end 365 --out plan_youversion.txt --delay 1.5

Uruchamiany w GitHub Actions (.github/workflows/youversion.yml), bo środowisko Claude nie ma dostępu do bible.com.
"""
import argparse
import os
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

PLAN_URL = "https://www.bible.com/reading-plans/10819-the-one-year-chronological-bible/day/{day}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; plan-chronologiczny/1.0; osobisty uzytek)",
    "Accept-Language": "pl,en;q=0.8",
}


def fetch_day(session, day, retries=3):
    url = PLAN_URL.format(day=day)
    for attempt in range(1, retries + 1):
        try:
            r = session.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.text
            print(f"  dzień {day}: HTTP {r.status_code} (próba {attempt})", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  dzień {day}: błąd {e} (próba {attempt})", file=sys.stderr)
        time.sleep(3 * attempt)  # wycofanie przy błędzie
    return None


def extract_refs(html):
    """Zwraca listę odnośników z linków zawierających /bible/, bez duplikatów, w kolejności."""
    soup = BeautifulSoup(html, "html.parser")
    refs, seen = [], set()
    for a in soup.find_all("a", href=True):
        if "/bible/" not in a["href"]:
            continue
        text = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        refs.append(text)
    return refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=365)
    HERE = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(HERE, "plan_youversion.txt"))
    ap.add_argument("--delay", type=float, default=1.5, help="sekundy między zapytaniami")
    args = ap.parse_args()

    session = requests.Session()
    failed = []
    with open(args.out, "w", encoding="utf-8") as f:
        for day in range(args.start, args.end + 1):
            html = fetch_day(session, day)
            if html is None:
                failed.append(day)
                f.write(f"Dzień {day}: BRAK DANYCH\n")
                continue
            refs = extract_refs(html)
            if not refs:
                failed.append(day)
                f.write(f"Dzień {day}: BRAK ODNOSNIKÓW (strona może renderować się w JS)\n")
            else:
                f.write(f"Dzień {day}: " + "; ".join(refs) + "\n")
            f.flush()
            print(f"dzień {day}: {len(refs)} odnośników")
            time.sleep(args.delay)

    print(f"\nZapisano: {args.out}")
    if failed:
        print(f"Dni do sprawdzenia ręcznie ({len(failed)}): {failed}")


if __name__ == "__main__":
    main()
