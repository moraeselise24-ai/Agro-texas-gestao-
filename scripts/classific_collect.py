import base64
import os
import sys
from dataclasses import dataclass
from typing import Optional

import requests
from playwright.sync_api import sync_playwright


def _env(key: str) -> Optional[str]:
    v = os.environ.get(key)
    if v is None:
        return None
    v = v.strip()
    return v if v else None


def _env_int(key: str) -> Optional[int]:
    v = _env(key)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def _to_number(text: str) -> float:
    t = (text or "").strip()
    if not t:
        return 0.0
    t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return 0.0


@dataclass
class CollectorConfig:
    base_url: str
    username: str
    password: str
    login_user_selector: str
    login_pass_selector: str
    login_submit_selector: str
    os_list_url: str
    os_row_selector: str
    col_id: int
    col_date: int
    col_client: int
    col_point: int
    col_tons: int
    col_rne: Optional[int]
    col_status: Optional[int]


def load_config() -> CollectorConfig:
    base_url = _env("CLASSIFIC_URL") or "https://sistema.classific.com.br/"
    username = _env("CLASSIFIC_USERNAME")
    password = _env("CLASSIFIC_PASSWORD")
    os_list_url = _env("CLASSIFIC_OS_LIST_URL")
    os_row_selector = _env("CLASSIFIC_OS_ROW_SELECTOR")

    col_id = _env_int("CLASSIFIC_OS_ID_COL")
    col_date = _env_int("CLASSIFIC_OS_DATE_COL")
    col_client = _env_int("CLASSIFIC_OS_CLIENT_COL")
    col_point = _env_int("CLASSIFIC_OS_POINT_COL")
    col_tons = _env_int("CLASSIFIC_OS_TONS_COL")

    missing = []
    if not username:
        missing.append("CLASSIFIC_USERNAME")
    if not password:
        missing.append("CLASSIFIC_PASSWORD")
    if not os_list_url:
        missing.append("CLASSIFIC_OS_LIST_URL")
    if not os_row_selector:
        missing.append("CLASSIFIC_OS_ROW_SELECTOR")
    if col_id is None:
        missing.append("CLASSIFIC_OS_ID_COL")
    if col_date is None:
        missing.append("CLASSIFIC_OS_DATE_COL")
    if col_client is None:
        missing.append("CLASSIFIC_OS_CLIENT_COL")
    if col_point is None:
        missing.append("CLASSIFIC_OS_POINT_COL")
    if col_tons is None:
        missing.append("CLASSIFIC_OS_TONS_COL")
    if missing:
        raise RuntimeError("Faltando configuração: " + ", ".join(missing))

    return CollectorConfig(
        base_url=base_url,
        username=username,
        password=password,
        login_user_selector=_env("CLASSIFIC_LOGIN_USER_SELECTOR")
        or 'input[name="email"], input[type="email"], input[name="login"]',
        login_pass_selector=_env("CLASSIFIC_LOGIN_PASS_SELECTOR")
        or 'input[name="password"], input[type="password"]',
        login_submit_selector=_env("CLASSIFIC_LOGIN_SUBMIT_SELECTOR")
        or 'button[type="submit"], input[type="submit"]',
        os_list_url=os_list_url,
        os_row_selector=os_row_selector,
        col_id=col_id,
        col_date=col_date,
        col_client=col_client,
        col_point=col_point,
        col_tons=col_tons,
        col_rne=_env_int("CLASSIFIC_OS_RNE_COL"),
        col_status=_env_int("CLASSIFIC_OS_STATUS_COL"),
    )


def collect(cfg: CollectorConfig):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(cfg.base_url, wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            page.locator(cfg.login_user_selector).first.fill(cfg.username)
            page.locator(cfg.login_pass_selector).first.fill(cfg.password)
            page.locator(cfg.login_submit_selector).first.click()
            page.wait_for_load_state("networkidle", timeout=30000)

            page.goto(cfg.os_list_url, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=30000)

            rows = page.locator(cfg.os_row_selector).element_handles()
            out = []
            for row in rows:
                cols = row.eval_on_selector_all(
                    "td", "els => els.map(e => (e.textContent || '').trim())"
                )
                cid = cols[cfg.col_id] if cfg.col_id < len(cols) else ""
                date_raw = cols[cfg.col_date] if cfg.col_date < len(cols) else ""
                client = cols[cfg.col_client] if cfg.col_client < len(cols) else ""
                point = cols[cfg.col_point] if cfg.col_point < len(cols) else ""
                tons_raw = cols[cfg.col_tons] if cfg.col_tons < len(cols) else ""

                rne_raw = ""
                if cfg.col_rne is not None and cfg.col_rne < len(cols):
                    rne_raw = cols[cfg.col_rne]

                status_raw = ""
                if cfg.col_status is not None and cfg.col_status < len(cols):
                    status_raw = cols[cfg.col_status]

                cid = (cid or "").strip()
                date = (date_raw or "").strip()[:10]
                client = (client or "").strip()
                point = (point or "").strip()

                if not cid or not date or not client or not point:
                    continue

                out.append(
                    {
                        "id": cid,
                        "date": date,
                        "clientName": client,
                        "embarkPoint": point,
                        "tons": _to_number(tons_raw),
                        "rne": _to_number(rne_raw) if rne_raw else None,
                        "status": status_raw.strip() if status_raw.strip() else None,
                    }
                )
            return out
        finally:
            page.close()
            browser.close()


def to_csv(records):
    headers = ["id", "date", "clientName", "embarkPoint", "tons", "rne", "status"]

    def esc(v):
        s = "" if v is None else str(v)
        s = s.replace('"', '""')
        return f'"{s}"'

    lines = [",".join(headers)]
    for r in records:
        line = ",".join(
            [
                esc(r.get("id")),
                esc(r.get("date")),
                esc(r.get("clientName")),
                esc(r.get("embarkPoint")),
                esc(r.get("tons")),
                esc("" if r.get("rne") is None else r.get("rne")),
                esc("" if r.get("status") is None else r.get("status")),
            ]
        )
        lines.append(line)
    return "\n".join(lines) + "\n"


def push_to_dashboard(csv_text: str):
    api_url = _env("DASHBOARD_API_URL") or "http://localhost:3001"
    endpoint = api_url.rstrip("/") + "/api/import/csv"
    content_b64 = base64.b64encode(csv_text.encode("utf-8")).decode("ascii")
    res = requests.post(endpoint, json={"contentBase64": content_b64, "delimiter": ","}, timeout=60)
    res.raise_for_status()
    return res.json()


def main():
    cfg = load_config()
    records = collect(cfg)
    csv_text = to_csv(records)

    out_path = _env("CLASSIFIC_OUT_CSV") or "classific_os.csv"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(csv_text)

    if (_env("DASHBOARD_PUSH") or "").lower() in ("1", "true", "yes", "y"):
        resp = push_to_dashboard(csv_text)
        print(resp)

    print(f"OK: {len(records)} registro(s). CSV: {out_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

