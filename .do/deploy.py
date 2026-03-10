#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "typer",
# ]
# ///
"""
MeTTa-KG DigitalOcean Deployment Script

This script automates the deployment of MeTTa-KG to DigitalOcean App Platform.
It fills in environment variables and deploys the app spec using doctl.

Usage:
    uv run .do/deploy.py --help
    uv run .do/deploy.py deploy --app-id <APP_ID> \
                                --github-owner <OWNER> \
                                --postgres-password <PASSWORD>

Requirements:
    - doctl CLI installed and authenticated
    - uv (Python package manager)
    - Environment variables or command-line arguments for configuration
"""

import subprocess
import sys
from pathlib import Path
from typing import Annotated

import typer

app = typer.Typer(
    help="Deploy MeTTa-KG to DigitalOcean App Platform",
    rich_markup_mode="rich",
)


def run_command(cmd: list[str], description: str) -> bool:
    """
    Run a shell command and return success status.

    Args:
        cmd: Command to run as list of strings
        description: Human-readable description of what's running

    Returns:
        True if command succeeds, False otherwise
    """
    typer.secho(f"▶ {description}...", fg=typer.colors.BLUE, bold=True)
    try:
        _ = subprocess.run(cmd, check=True, capture_output=True, text=True)
        typer.secho(f"✓ {description} completed", fg=typer.colors.GREEN)
        return True
    except subprocess.CalledProcessError as e:
        typer.secho(f"✗ {description} failed", fg=typer.colors.RED, bold=True)
        typer.echo(f"Error: {e.stderr}")
        return False


@app.command()
def deploy(
    github_owner: Annotated[
        str,
        typer.Option(
            "--github-owner",
            help="GitHub username or organization (e.g., arist76, qoba-ai)",
            envvar="GITHUB_OWNER",
        ),
    ],
    app_id: Annotated[
        str,
        typer.Option(
            "--app-id",
            help="DigitalOcean App ID (UUID from 'doctl apps list')",
            envvar="DO_APP_ID",
        ),
    ] = "f966e486-4170-416b-82d5-43aa469181b8",
    postgres_host: Annotated[
        str,
        typer.Option(
            "--postgres-host",
            help="PostgreSQL database host",
            envvar="POSTGRES_HOST",
        ),
    ] = "db-postgresql-fra1-09856-do-user-17508861-0.m.db.ondigitalocean.com",
    postgres_port: Annotated[
        str,
        typer.Option(
            "--postgres-port",
            help="PostgreSQL database port",
            envvar="POSTGRES_PORT",
        ),
    ] = "25060",
    postgres_user: Annotated[
        str,
        typer.Option(
            "--postgres-user",
            help="PostgreSQL username",
            envvar="POSTGRES_USER",
        ),
    ] = "doadmin",
    postgres_db: Annotated[
        str,
        typer.Option(
            "--postgres-db",
            help="PostgreSQL database name",
            envvar="POSTGRES_DB",
        ),
    ] = "metta-kg",
    postgres_password: Annotated[
        str,
        typer.Option(
            "--postgres-password",
            help="PostgreSQL password (if provided, will be set as secret in DigitalOcean)",
            envvar="POSTGRES_PASSWORD",
        ),
    ] = None,
    frontend_url: Annotated[
        str,
        typer.Option(
            "--frontend-url",
            help="Frontend URL for CORS configuration",
            envvar="FRONTEND_URL",
        ),
    ] = "https://metta-kg.vercel.app",
    dry_run: Annotated[
        bool,
        typer.Option(
            "--dry-run",
            help="Show what would be deployed without actually deploying",
        ),
    ] = False,
):
    """
    Deploy MeTTa-KG to DigitalOcean.

    This command:
    1. Reads the app.yaml template
    2. Fills in placeholders with your values
    3. Deploys to DigitalOcean using doctl
    4. Optionally sets the database password as a secret (if --postgres-password is provided)

    Examples:

        # Basic deployment (set password in Dashboard later)
        $ uv run .do/deploy.py deploy --app-id <APP_ID> --github-owner arist76

        # With password (will be set as encrypted secret)
        $ uv run .do/deploy.py deploy \\
            --app-id <APP_ID> \\
            --github-owner arist76 \\
            --postgres-password <PASSWORD>

        # With custom frontend URL
        $ uv run .do/deploy.py deploy \\
            --app-id <APP_ID> \\
            --github-owner arist76 \\
            --frontend-url https://your-app.vercel.app

        # Dry run (preview without deploying)
        $ uv run .do/deploy.py deploy \\
            --app-id <APP_ID> \\
            --github-owner arist76 \\
            --dry-run
    """

    typer.echo()
    typer.secho("🚀 MeTTa-KG DigitalOcean Deployment", fg=typer.colors.CYAN, bold=True)
    typer.echo()

    # Validate inputs
    if not app_id:
        typer.secho("Error: --app-id is required", fg=typer.colors.RED)
        sys.exit(1)

    if not github_owner:
        typer.secho("Error: --github-owner is required", fg=typer.colors.RED)
        sys.exit(1)

    # Show configuration
    typer.secho("Configuration:", fg=typer.colors.BLUE, bold=True)
    typer.echo(f"  App ID:              {app_id}")
    typer.echo(f"  GitHub Owner:        {github_owner}")
    typer.echo(f"  Database Host:       {postgres_host}")
    typer.echo(f"  Database Port:       {postgres_port}")
    typer.echo(f"  Database User:       {postgres_user}")
    typer.echo(f"  Database Name:       {postgres_db}")
    typer.echo(f"  Frontend URL:        {frontend_url}")
    if postgres_password:
        typer.echo(f"  Set Password:        Yes (will be set as secret)")
    else:
        typer.echo(f"  Set Password:        No (set manually in Dashboard)")
    typer.echo(f"  Dry Run:             {dry_run}")
    typer.echo()

    # Read template
    template_path = Path(__file__).parent / "app.yaml"
    if not template_path.exists():
        typer.secho(
            f"Error: Template not found at {template_path}",
            fg=typer.colors.RED,
        )
        sys.exit(1)

    template_content = template_path.read_text()

    # Fill in placeholders
    # Replace ${GITHUB_REGISTRY_OWNER}
    filled_content = template_content.replace("${GITHUB_REGISTRY_OWNER}", github_owner)

    # Update POSTGRES values (find and replace existing values)
    import re

    filled_content = re.sub(
        r"(- key: POSTGRES_HOST\s+scope: RUN_TIME\s+value:)[^\n]+",
        rf"\1 {postgres_host}",
        filled_content,
    )
    filled_content = re.sub(
        r"(- key: POSTGRES_PORT\s+scope: RUN_TIME\s+value:)[^\n]+",
        rf'\1 "{postgres_port}"',
        filled_content,
    )
    filled_content = re.sub(
        r"(- key: POSTGRES_USER\s+scope: RUN_TIME\s+value:)[^\n]+",
        rf"\1 {postgres_user}",
        filled_content,
    )
    filled_content = re.sub(
        r"(- key: POSTGRES_DB\s+scope: RUN_TIME\s+value:)[^\n]+",
        rf"\1 {postgres_db}",
        filled_content,
    )
    filled_content = re.sub(
        r"(- key: METTA_KG_FRONTEND_URL\s+scope: RUN_TIME\s+value:)[^\n]+",
        rf'\1 "{frontend_url}"',
        filled_content,
    )

    # Update POSTGRES_PASSWORD if provided
    if postgres_password:
        # Replace the SECRET type with actual value
        filled_content = re.sub(
            r"(- key: POSTGRES_PASSWORD\s+scope: RUN_TIME\s+)type: SECRET[^\n]*",
            rf'\1value: "{postgres_password}"',
            filled_content,
        )

    if dry_run:
        typer.echo()
        typer.secho("Deployment spec preview:", fg=typer.colors.BLUE, bold=True)
        typer.echo()

        # Show full spec in less
        less_process = subprocess.Popen(
            ["less", "-R"], stdin=subprocess.PIPE, text=True
        )
        less_process.communicate(input=filled_content)

        typer.echo()
        typer.secho("Dry run complete. No changes made.", fg=typer.colors.YELLOW)
        return

    # Write temporary spec file
    temp_spec_path = Path(__file__).parent / "app.deploy.yaml"
    temp_spec_path.write_text(filled_content)
    typer.secho(
        f"✓ Generated deployment spec: {temp_spec_path.relative_to(Path.cwd())}",
        fg=typer.colors.GREEN,
    )

    # Confirm deployment
    typer.echo()
    if not typer.confirm("Deploy to DigitalOcean?"):
        typer.secho("Deployment cancelled", fg=typer.colors.YELLOW)
        temp_spec_path.unlink()
        sys.exit(0)

    # Deploy using doctl
    deploy_cmd = [
        "doctl",
        "apps",
        "update",
        app_id,
        "--spec",
        str(temp_spec_path),
    ]

    if not run_command(deploy_cmd, "Deploying to DigitalOcean"):
        temp_spec_path.unlink()
        sys.exit(1)

    # Cleanup
    temp_spec_path.unlink()

    # Show warning if password not provided
    if not postgres_password:
        typer.echo()
        typer.secho(
            "⚠ PostgreSQL password not set - remember to set it in the Dashboard:",
            fg=typer.colors.YELLOW,
        )
        typer.secho(
            f"  https://cloud.digitalocean.com/apps/{app_id}/settings",
            fg=typer.colors.CYAN,
        )

    typer.echo()
    typer.secho("✓ Deployment complete!", fg=typer.colors.GREEN, bold=True)
    typer.echo()
    typer.secho(
        f"Monitor your deployment at:",
        fg=typer.colors.BLUE,
    )
    typer.secho(
        f"https://cloud.digitalocean.com/apps/{app_id}",
        fg=typer.colors.CYAN,
        bold=True,
    )
    typer.echo()


@app.command()
def validate():
    """Validate the app.yaml template is correct."""
    typer.secho("Validating app.yaml...", fg=typer.colors.BLUE, bold=True)

    template_path = Path(__file__).parent / "app.yaml"
    if not template_path.exists():
        typer.secho(
            f"Error: Template not found at {template_path}",
            fg=typer.colors.RED,
        )
        sys.exit(1)

    content = template_path.read_text()

    # Check for required keys
    required_keys = [
        ("${GITHUB_REGISTRY_OWNER}", "GitHub registry owner placeholder"),
        ("POSTGRES_HOST", "PostgreSQL host"),
        ("POSTGRES_PORT", "PostgreSQL port"),
        ("POSTGRES_USER", "PostgreSQL user"),
        ("POSTGRES_DB", "PostgreSQL database"),
        ("POSTGRES_PASSWORD", "PostgreSQL password"),
        ("METTA_KG_FRONTEND_URL", "Frontend URL"),
        ("METTA_KG_MORK_URL", "Mork service URL"),
    ]

    found_issues = False
    for key, description in required_keys:
        if key not in content:
            typer.secho(
                f"✗ Missing: {description} ({key})",
                fg=typer.colors.RED,
            )
            found_issues = True
        else:
            typer.secho(
                f"✓ Found: {description}",
                fg=typer.colors.GREEN,
            )

    if found_issues:
        typer.secho("Validation failed", fg=typer.colors.RED, bold=True)
        sys.exit(1)

    typer.secho("✓ Validation passed", fg=typer.colors.GREEN, bold=True)


if __name__ == "__main__":
    app()
