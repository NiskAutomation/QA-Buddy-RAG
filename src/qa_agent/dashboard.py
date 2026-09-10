from __future__ import annotations

import html
from pathlib import Path

from .models import TraceRow


def render_dashboard(rows: list[TraceRow], status: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    covered = sum(row.coverage_status == "covered" for row in rows)
    total = len(rows)
    coverage = round((covered / total) * 100) if total else 0
    table_rows = "\n".join(
        "<tr>"
        f"<td><code>{html.escape(row.requirement_id)}</code></td>"
        f"<td>{html.escape(', '.join(row.scenario_ids) or '—')}</td>"
        f"<td>{html.escape(', '.join(row.test_case_ids) or '—')}</td>"
        f"<td>{html.escape(', '.join(row.script_files) or '—')}</td>"
        f"<td><span class='pill {html.escape(row.coverage_status)}'>{html.escape(row.coverage_status.replace('_', ' '))}</span></td>"
        "</tr>"
        for row in rows
    )
    page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Agentic QA Report</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
    body {{ margin: 0; background: #07111f; color: #dbeafe; }}
    main {{ max-width: 1180px; margin: auto; padding: 48px 24px; }}
    h1 {{ margin: 0 0 8px; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -.04em; }}
    .muted {{ color: #93a4ba; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; margin: 32px 0; }}
    .card {{ background: #0d1b2e; border: 1px solid #20344e; border-radius: 16px; padding: 22px; box-shadow: 0 12px 35px #0005; }}
    .metric {{ font-size: 2rem; font-weight: 750; color: #67e8f9; }}
    .table-wrap {{ overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 780px; }}
    th, td {{ padding: 14px 12px; border-bottom: 1px solid #20344e; text-align: left; vertical-align: top; }}
    th {{ color: #93c5fd; font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; }}
    code {{ color: #a5f3fc; }}
    .pill {{ display:inline-block; padding:5px 9px; border-radius:999px; font-size:.75rem; background:#26364b; }}
    .covered {{ color:#86efac; background:#14532d66; }}
    .missing_script,.missing_case,.missing_scenario {{ color:#fde68a; background:#713f1266; }}
  </style>
</head>
<body><main>
  <p class="muted">SCHEMA-VALIDATED · RAG-GROUNDED · TRACEABLE</p>
  <h1>Agentic QA report</h1>
  <p class="muted">Pipeline status: {html.escape(status)}</p>
  <section class="grid">
    <div class="card"><div class="metric">{total}</div><div class="muted">Requirements</div></div>
    <div class="card"><div class="metric">{covered}</div><div class="muted">Fully automated</div></div>
    <div class="card"><div class="metric">{coverage}%</div><div class="muted">Traceability coverage</div></div>
  </section>
  <section class="card table-wrap">
    <h2>Requirement → scenario → case → script</h2>
    <table><thead><tr><th>Requirement</th><th>Scenarios</th><th>Cases</th><th>Scripts</th><th>Status</th></tr></thead>
    <tbody>{table_rows}</tbody></table>
  </section>
</main></body></html>"""
    output_path.write_text(page, encoding="utf-8")
    return output_path
