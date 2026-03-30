"""Tests for knowledge file parsers."""
import pytest
from app.api.knowledge import _parse_markdown_entries, _parse_csv_entries


def test_parse_markdown_qa_format():
    """Parse #### Q: / **A:** format separated by ---."""
    content = """#### Q: 地址错误怎么处理？

**A:** 关于地址错误的处理：

**方式1：与保安协商**
- 下单人可以自行联系保安

**方式2：重新派送**
- 需要重新下单
- 费用与正常派送相同

---

#### Q: 改地址的截止时间？

**A:** 在订单进入调度系统之前可以自行修改。

订单派单后需致电客服处理。

---
"""
    entries = _parse_markdown_entries(content)
    assert len(entries) == 2
    assert "地址错误" in entries[0]["question"]
    assert "保安" in entries[0]["answer"]
    assert "改地址" in entries[1]["question"]
    assert "调度系统" in entries[1]["answer"]


def test_parse_markdown_strips_bold():
    """Bold markers (**text**) should be stripped from answers."""
    content = """#### Q: 费用多少？

**A:** **标准费用**是$10，**加急费用**是$20。

---
"""
    entries = _parse_markdown_entries(content)
    assert len(entries) == 1
    assert "**" not in entries[0]["answer"]
    assert "标准费用" in entries[0]["answer"]


def test_parse_markdown_no_qa_returns_empty():
    """Non-QA markdown should return empty list."""
    content = """# 公司简介

FleetNow 是一家物流公司，成立于2020年。

我们提供多种配送方案。
"""
    entries = _parse_markdown_entries(content)
    assert len(entries) == 0


def test_parse_markdown_various_heading_levels():
    """Support different heading levels for Q:."""
    content = """## Q: 一级问题？

**A:** 一级答案。

---

### Q: 二级问题？

**A:** 二级答案。

---
"""
    entries = _parse_markdown_entries(content)
    assert len(entries) == 2


def test_parse_csv():
    """CSV parsing still works."""
    content = "question,answer,category\n你们配送范围？,大多伦多地区,配送\n费用多少？,$10起,价格\n"
    entries = _parse_csv_entries(content)
    assert len(entries) == 2
    assert entries[0]["question"] == "你们配送范围？"
