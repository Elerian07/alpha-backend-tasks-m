from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models.briefing import Briefing

_TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates"



class MetricViewModel:
    def __init__(self, name: str, value: str) -> None:
        self.name = name.strip().title()
        self.value = value.strip()


class BriefingReportViewModel:
    def __init__(self, briefing: Briefing) -> None:
        self.report_title = f"{briefing.company_name} ({briefing.ticker}) — Analyst Briefing"
        self.company_name = briefing.company_name
        self.ticker = briefing.ticker
        self.sector = briefing.sector
        self.analyst_name = briefing.analyst_name
        self.summary = briefing.summary
        self.recommendation = briefing.recommendation

        sorted_points = sorted(briefing.points, key=lambda p: p.display_order)
        self.key_points = [p.content for p in sorted_points if p.point_type == "key_point"]
        self.risks = [p.content for p in sorted_points if p.point_type == "risk"]

        self.metrics = [MetricViewModel(m.name, m.value) for m in briefing.metrics]
        self.has_metrics = len(self.metrics) > 0

        self.generated_at = (
            briefing.generated_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if briefing.generated_at
            else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )



class BriefingReportFormatter:
    def __init__(self) -> None:
        self._env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=select_autoescape(enabled_extensions=("html", "xml"), default_for_string=True),
        )

    def render(self, briefing: Briefing) -> str:
        vm = BriefingReportViewModel(briefing)
        template = self._env.get_template("briefing_report.html")
        return template.render(report=vm)


briefing_report_formatter = BriefingReportFormatter()
