import json
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from scrapling.fetchers import StealthyFetcher
from scrapling.parser import Selector


@dataclass(frozen=True)
class SourceConfig:
    url: str
    article_selector: str
    link_selector: str
    headline_selector: str
    summary_selector: str
    image_selector: str


SOURCES: tuple[SourceConfig, ...] = (
    SourceConfig("https://techcrunch.com/latest/", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://www.theverge.com/tech", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://arstechnica.com/gadgets/", "article", "a", "h2, h3", "p", "img"),
)


def normalize_url(base_url: str, value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    candidate = urljoin(base_url, cleaned)
    return candidate if urlparse(candidate).scheme in {"http", "https"} else ""


def first_text(node: Selector, selector: str) -> str:
    match = node.css(selector).first
    return " ".join(match.text.split()) if match is not None else ""


def image_urls(node: Selector, source_url: str, selector: str) -> list[str]:
    values: list[str] = []
    for image in node.css(selector):
        raw = image.attrib.get("src") or image.attrib.get("data-src") or ""
        normalized = normalize_url(source_url, raw)
        if normalized and normalized not in values:
            values = [*values, normalized]
        if len(values) == 2:
            break
    return values


def parse_source(html: str, source: SourceConfig) -> list[dict[str, object]]:
    page = Selector(html)
    candidates: list[dict[str, object]] = []
    for article in page.css(source.article_selector):
        link = article.css(source.link_selector).first
        source_url = normalize_url(source.url, link.attrib.get("href", "") if link else "")
        headline = first_text(article, source.headline_selector)
        if not source_url or not headline:
            continue
        candidates = [*candidates, {
            "sourceUrl": source_url,
            "headline": headline,
            "summary": first_text(article, source.summary_selector),
            "referenceImageUrls": image_urls(article, source.url, source.image_selector),
        }]
    return candidates


def fetch_html(url: str) -> str:
    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    return page.html_content


def scrape_themes(fetch: Callable[[str], str]) -> list[dict[str, object]]:
    by_url: dict[str, dict[str, object]] = {}
    for source in SOURCES:
        for candidate in parse_source(fetch(source.url), source):
            by_url = {**by_url, str(candidate["sourceUrl"]): candidate}
    return list(by_url.values())


def main() -> None:
    payload = {"candidates": scrape_themes(fetch_html)}
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
