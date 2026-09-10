from qa_agent.ingestion import semantic_chunks


def test_semantic_chunking_preserves_section_and_limits_size() -> None:
    chunks = semantic_chunks(
        "requirements.md",
        [("REQ-LOGIN-001", "The system shall accept valid users.\n\nIt must reject invalid users.")],
        max_chars=55,
        overlap_paragraphs=0,
    )

    assert len(chunks) == 2
    assert all(chunk.section == "REQ-LOGIN-001" for chunk in chunks)
    assert all(len(chunk.text) <= 55 for chunk in chunks)
    assert chunks[0].id.startswith("CHK-")
