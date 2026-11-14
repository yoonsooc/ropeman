from agent.retrieval.tokenize import tokenize


def test_splits_camel_case_and_keeps_whole_identifier():
    # Arrange
    text = "refreshAccessToken"

    # Act
    tokens = tokenize(text)

    # Assert
    assert tokens == ["refresh", "access", "token", "refreshaccesstoken"]


def test_splits_snake_and_screaming_case():
    assert tokenize("HTTP_TIMEOUT get_environ_proxies") == [
        "http",
        "timeout",
        "http_timeout",
        "get",
        "environ",
        "proxies",
        "get_environ_proxies",
    ]


def test_drops_stopwords_but_not_code_words():
    assert tokenize("What is the session TTL?") == ["session", "ttl"]


def test_keeps_version_suffixes_distinct():
    assert "parse_v2" in tokenize("parse_v2") and "parse_v3" not in tokenize("parse_v2")


def test_keeps_non_ascii_words():
    assert tokenize("세션 만료") == ["세션", "만료"]
