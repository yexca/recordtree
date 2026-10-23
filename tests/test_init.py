from __future__ import annotations

from pathlib import Path

from recordtree.app import RecordTreeApp
from recordtree.config import ensure_config, load_config, resolve_path
from recordtree.db import connect


EXPECTED_TABLES = {
    "schema_meta",
    "record_groups",
    "actors",
    "record_group_actors",
    "sources",
    "record_group_sources",
    "download_links",
    "imports",
    "import_errors",
    "downloads",
    "download_items",
    "legacy_migration_map",
}

EXPECTED_INDEXES = {
    "idx_record_groups_delivery_date",
    "idx_record_groups_entry_date",
    "idx_record_groups_deleted",
    "idx_record_groups_source_type",
    "idx_actors_normalized",
    "idx_sources_normalized",
    "idx_links_group_active",
    "idx_links_url",
    "idx_links_active_url",
    "idx_links_file_type",
    "idx_download_items_link_status",
    "idx_legacy_map_group",
}


def test_init_creates_paths_and_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    first = RecordTreeApp().init()
    config_text = first.config_path.read_text(encoding="utf-8")
    second = RecordTreeApp().init()

    assert first.config_path == tmp_path / "config" / "config.toml"
    assert first.database_path == tmp_path / "config" / "recordtree.sqlite3"
    assert first.downloads_dir == tmp_path / "downloads"
    assert first.logs_dir == tmp_path / "logs"
    assert first.schema_version == "2"
    assert second.schema_version == "2"
    assert first.config_path.read_text(encoding="utf-8") == config_text
    assert first.database_path.exists()
    assert first.downloads_dir.is_dir()
    assert first.logs_dir.is_dir()


def test_init_schema_tables_indexes_and_foreign_keys(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    result = RecordTreeApp().init()

    conn = connect(result.database_path)
    try:
        tables = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        indexes = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            ).fetchall()
        }
        schema_version = conn.execute(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'"
        ).fetchone()
        foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    finally:
        conn.close()

    assert EXPECTED_TABLES <= tables
    assert EXPECTED_INDEXES <= indexes
    assert schema_version["value"] == "2"
    assert foreign_keys == 1


def test_ensure_config_does_not_overwrite_existing_file(tmp_path: Path) -> None:
    config_path = tmp_path / "config" / "config.toml"
    config_path.parent.mkdir()
    config_path.write_text("[paths]\ndatabase = \"custom.sqlite3\"\n", encoding="utf-8")

    ensure_config(config_path)

    assert config_path.read_text(encoding="utf-8") == "[paths]\ndatabase = \"custom.sqlite3\"\n"


def test_load_config_uses_defaults_for_missing_sections(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    config_path = ensure_config(Path("config/config.toml"))

    loaded = load_config(config_path)

    assert loaded.database_path == tmp_path / "config" / "recordtree.sqlite3"
    assert loaded.downloads_dir == tmp_path / "downloads"
    assert loaded.logs_dir == tmp_path / "logs"
    assert loaded.safety_margin_percent == 5
    assert loaded.safety_margin_min_mb == 10240
    assert loaded.include_par2_by_default is False
    assert loaded.folder_template == "{actor_safe_name}/{record_group_id}"


def test_resolve_path_keeps_absolute_paths(tmp_path: Path) -> None:
    absolute = tmp_path / "custom.sqlite3"

    assert resolve_path(Path.cwd(), str(absolute)) == absolute


def test_init_migrates_legacy_env_layout(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    RecordTreeApp().init()
    config_dir = tmp_path / "config"
    legacy_dir = tmp_path / "env"
    legacy_dir.mkdir()
    legacy_config = (config_dir / "config.toml").read_text(encoding="utf-8").replace(
        "config/recordtree.sqlite3", "env/recordtree.sqlite3"
    )
    (legacy_dir / "config.toml").write_text(legacy_config, encoding="utf-8")
    (config_dir / "recordtree.sqlite3").rename(legacy_dir / "recordtree.sqlite3")
    (config_dir / "config.toml").unlink()

    result = RecordTreeApp().init()

    assert result.config_path == config_dir / "config.toml"
    assert result.database_path == config_dir / "recordtree.sqlite3"
    assert result.database_path.exists()
    assert not (legacy_dir / "config.toml").exists()
    assert not (legacy_dir / "recordtree.sqlite3").exists()
    assert 'database = "config/recordtree.sqlite3"' in result.config_path.read_text(encoding="utf-8")
