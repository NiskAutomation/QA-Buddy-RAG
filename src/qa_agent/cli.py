from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from .config import Settings
from .pipeline import QAPipeline
from .providers import make_provider


app = typer.Typer(no_args_is_help=True, pretty_exceptions_show_locals=False)
console = Console()


@app.command()
def run_pipeline(
    input_path: Annotated[
        Path,
        typer.Option("--input", "-i", exists=True, readable=True, help="Requirement file or directory."),
    ],
    output_dir: Annotated[
        Path,
        typer.Option("--output", "-o", help="Machine-readable artifacts and report."),
    ] = Path("artifacts/latest"),
    provider: Annotated[
        str | None,
        typer.Option("--provider", help="mock for offline/CI; claude for grounded generation."),
    ] = None,
    approve_test_cases: Annotated[
        bool,
        typer.Option("--approve-test-cases", help="Pass the human gate and generate automation."),
    ] = False,
    publish_dir: Annotated[
        Path,
        typer.Option("--publish-dir", help="Static Vercel directory."),
    ] = Path("public"),
) -> None:
    """Run the requirements-to-automation graph."""

    settings = Settings()
    selected_provider = provider or settings.provider
    generator = make_provider(selected_provider, settings.anthropic_api_key, settings.anthropic_model)
    repo_root = Path(__file__).resolve().parents[2]
    pipeline = QAPipeline(settings, generator)
    state = pipeline.run(
        input_path=input_path,
        output_dir=output_dir,
        approve_test_cases=approve_test_cases,
        publish_dir=publish_dir,
        generated_root=repo_root / "automation" / "generated",
    )

    table = Table(title="Agentic QA pipeline")
    table.add_column("Status")
    table.add_column("Artifacts")
    table.add_row(state["status"], str(output_dir.resolve()))
    console.print(table)
    if state["status"] == "clarification_required":
        console.print("Blocking requirement questions:")
        for question in state["clarification_questions"]:
            console.print(f" • {question}")
        console.print("Update or supplement the input requirements, then rerun the pipeline.")
    elif state["status"] == "approval_required":
        console.print(
            "Review [bold]06-test-cases.json[/bold], then rerun with "
            "[bold]--approve-test-cases[/bold] to generate scripts."
        )
    else:
        console.print(f"Dashboard: {(publish_dir / 'index.html').resolve()}")


if __name__ == "__main__":
    app()
