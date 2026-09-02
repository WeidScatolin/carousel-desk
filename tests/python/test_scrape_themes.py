import json
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import scripts.scrape_themes as scraper
from scripts.scrape_themes import SourceConfig, normalize_url, parse_source


FIXTURE = Path(__file__).parent / "fixtures" / "tech_news.html"
SOURCE = SourceConfig(
    url="https://news.example.com/latest",
    article_selector="article.story",
    link_selector="a.story-link",
    headline_selector="h2",
    summary_selector="p.dek",
    image_selector="img",
)


def test_parse_source_extracts_normalized_candidates_and_two_images() -> None:
    # Arrange
    html = FIXTURE.read_text(encoding="utf-8")

    # Act
    candidates = parse_source(html, SOURCE)

    # Assert
    assert candidates == [
        {
            "sourceUrl": "https://news.example.com/ai/new-model",
            "headline": "New AI model ships",
            "summary": "The release lowers inference costs for small teams.",
            "referenceImageUrls": [
                "https://news.example.com/images/model.jpg",
                "https://cdn.example.com/chart.png",
            ],
        },
        {
            "sourceUrl": "https://news.example.com/security/passkeys",
            "headline": "Passkeys reach more users",
            "summary": "A platform update expands passwordless sign-in.",
            "referenceImageUrls": [],
        },
    ]


def test_normalize_url_rejects_non_http_protocols() -> None:
    # Arrange / Act / Assert
    assert normalize_url("https://news.example.com", "javascript:alert(1)") == ""
    assert normalize_url("https://news.example.com", "data:image/png;base64,abc") == ""


def test_scrape_themes_deduplicates_source_urls(monkeypatch) -> None:
    # Arrange
    html = FIXTURE.read_text(encoding="utf-8")
    monkeypatch.setattr(scraper, "SOURCES", (SOURCE, SOURCE))
    fetch_html: Callable[[str], str] = lambda _url: html

    # Act
    candidates = scraper.scrape_themes(fetch_html)

    # Assert
    assert len(candidates) == 2
    assert candidates[0]["sourceUrl"] == "https://news.example.com/ai/new-model"


def test_cli_prints_one_json_document(monkeypatch, capsys) -> None:
    # Arrange
    expected = [{
        "sourceUrl": "https://news.example.com/item",
        "headline": "Headline",
        "summary": "Summary",
        "referenceImageUrls": [],
    }]
    monkeypatch.setattr(scraper, "scrape_themes", lambda _fetch: expected)

    # Act
    scraper.main()

    # Assert
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"candidates": expected}
    assert captured.err == ""
    assert captured.out.count("\n") == 1
