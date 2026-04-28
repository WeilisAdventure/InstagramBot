"""Knowledge base directory location.

Section content is loaded by ``app.knowledge.sections`` (intent-routed).
This module just exposes the directory path so other modules can find
``system_prompt.md`` and the section files.
"""

from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "knowledge_base"
