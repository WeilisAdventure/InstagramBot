from app.services.comment_trigger import match_keywords, render_template


def test_match_contains():
    assert match_keywords("How much does delivery cost?", ["delivery", "price"], "contains")
    assert not match_keywords("Hello there", ["delivery", "price"], "contains")


def test_match_exact():
    assert match_keywords("price", ["price"], "exact")
    assert not match_keywords("what is the price", ["price"], "exact")


def test_match_regex():
    assert match_keywords("delivery in 2 days", [r"delivery in \d+ days"], "regex")
    assert not match_keywords("fast shipping", [r"delivery in \d+ days"], "regex")


def test_match_case_insensitive():
    assert match_keywords("DELIVERY", ["delivery"], "contains")
    assert match_keywords("PRICE", ["price"], "exact")


def test_render_template():
    # Single-brace, both name keys
    assert render_template("Hi {name}!", name="John") == "Hi John!"
    assert render_template("Hi {username}!", name="John") == "Hi John!"
    # Double-brace (Mustache style)
    assert render_template("Hi {{username}}!", name="John") == "Hi John!"
    assert render_template("Hi {{name}}, ready?", username="Mei") == "Hi Mei, ready?"
    # No placeholder
    assert render_template("No placeholders") == "No placeholders"
    # Unknown placeholder is left alone, no exception
    assert render_template("Missing {unknown}", name="John") == "Missing {unknown}"
