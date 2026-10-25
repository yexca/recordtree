from __future__ import annotations

import csv
from collections.abc import Callable, Sequence
from dataclasses import replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3

from . import config as config_module
from . import db
from . import mega
from .exceptions import ConfigError, ExternalToolError, ImportRowError, NotFoundError, ValidationError
from .importer.excel import ExcelImporter
from .importer.service import ImportService, SyncSummary
from .models import (
    ActorSummary,
    ActorDownloadResult,
    ActorPage,
    BackupSummary,
    DoctorCheck,
    DoctorResult,
    DownloadExecutionResult,
    DownloadItemDetail,
    DownloadPage,
    DownloadPlan,
    ImportResult,
    ImportErrorPage,
    ImportPage,
    ImportProgress,
    ImportStats,
    IntegrityResult,
    InitResult,
    MaintenanceActionResult,
    MaintenanceSummary,
    MegaCommandResult,
    MegaCommandStatus,
    MegaAccountStatus,
    MegaLoginStatus,
    OrphanReport,
    RecordPage,
    RecordDetail,
    RecordSummary,
    SourceSummary,
    SourcePage,
    StatsResult,
)
from .path_templates import allowed_download_template_variables, normalize_download_folder_template
from .repositories import ActorRepository, DownloadRepository, ImportRepository
from .search import SearchService, normalize_limit, normalize_page

IMPORT_FILE_EXTENSIONS = frozenset({".xlsx", ".xlsm"})
# Progress events per import phase; each one becomes a WebUI job event.
IMPORT_PROGRESS_STEPS = 200


class RecordTreeApp:
    """Application service layer for CLI use cases."""

    def init(self) -> InitResult:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)

        app_config.database_path.parent.mkdir(parents=True, exist_ok=True)
        app_config.downloads_dir.mkdir(parents=True, exist_ok=True)
        app_config.logs_dir.mkdir(parents=True, exist_ok=True)
        app_config.cache_dir.mkdir(parents=True, exist_ok=True)

        conn = db.connect(app_config.database_path)
        try:
            db.initialize_schema(conn)
            DownloadRepository(conn).mark_interrupted_downloads(_interrupted_message())
            conn.commit()
            schema_version = conn.execute(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'"
            ).fetchone()
        finally:
            conn.close()

        return InitResult(
            config_path=config_path,
            database_path=app_config.database_path,
            downloads_dir=app_config.downloads_dir,
            logs_dir=app_config.logs_dir,
            cache_dir=app_config.cache_dir,
            schema_version=schema_version["value"] if schema_version else "unknown",
        )

    def doctor(self) -> None:
        checks: list[DoctorCheck] = []
        config_path = config_module.default_config_path().expanduser()
        app_config = None
        if config_path.exists():
            try:
                app_config = config_module.load_config(config_path)
            except ConfigError as error:
                checks.append(DoctorCheck("config", "fail", str(error)))
            else:
                checks.append(DoctorCheck("config", "pass", str(config_path.resolve())))
        else:
            checks.append(DoctorCheck("config", "fail", f"Config file does not exist: {config_path}"))

        if app_config is not None:
            try:
                conn = db.connect(app_config.database_path)
                try:
                    version = conn.execute(
                        "SELECT value FROM schema_meta WHERE key = 'schema_version'"
                    ).fetchone()
                finally:
                    conn.close()
            except Exception as error:
                checks.append(DoctorCheck("database", "fail", str(error)))
                checks.append(DoctorCheck("schema", "fail", "Schema version could not be read."))
            else:
                checks.append(DoctorCheck("database", "pass", str(app_config.database_path)))
                if version is None:
                    checks.append(DoctorCheck("schema", "fail", "schema_version is missing."))
                else:
                    checks.append(DoctorCheck("schema", "pass", str(version["value"])))

            for name, path in _runtime_dirs(app_config):
                checks.append(_check_writable_dir(name, path))

            whoami = _check_executable("mega-whoami", app_config.mega_whoami)
            get = _check_executable("mega-get", app_config.mega_get)
            checks.extend([whoami[0], get[0]])
            if whoami[1] is not None:
                login = mega.check_login(whoami[1])
                if login.logged_in:
                    checks.append(DoctorCheck("mega_login", "pass", login.message))
                else:
                    checks.append(
                        DoctorCheck(
                            "mega_login",
                            "fail",
                            "MEGA is not logged in. Use Settings or run mega-login.",
                        )
                    )
            else:
                checks.append(DoctorCheck("mega_login", "warn", "Skipped because mega-whoami is unavailable."))

        return DoctorResult(checks)

    def mega_status(self) -> MegaAccountStatus:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        get_status = _mega_command_status(app_config.mega_get)
        whoami_status = _mega_command_status(app_config.mega_whoami)
        login_status = _mega_command_status(app_config.mega_login)
        logout_status = _mega_command_status(app_config.mega_logout)
        if whoami_status.resolved is None:
            login = MegaLoginStatus(False, 1, "Skipped because mega-whoami is unavailable.")
        else:
            login = mega.check_login(whoami_status.resolved)
        return MegaAccountStatus(
            login=login,
            mega_get=get_status,
            mega_whoami=whoami_status,
            mega_login=login_status,
            mega_logout=logout_status,
            home_dir=Path.home(),
            persistence_dir=_megacmd_persistence_dir(),
        )

    def mega_login(
        self,
        email: str,
        password: str,
        auth_code: str | None = None,
    ) -> MegaAccountStatus:
        clean_email = email.strip()
        if not clean_email:
            raise ValidationError("MEGA email is required.")
        if not password:
            raise ValidationError("MEGA password is required.")
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        mega_login = mega.resolve_executable(app_config.mega_login)
        result = mega.login_account(mega_login, clean_email, password, auth_code.strip() if auth_code else None)
        if result.exit_code != 0:
            message = _command_message(result.stdout, result.stderr) or f"mega-login failed with exit code {result.exit_code}."
            raise ExternalToolError(message.replace(password, "<redacted>"))
        return self.mega_status()

    def mega_logout(self) -> MegaAccountStatus:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        mega_logout = mega.resolve_executable(app_config.mega_logout)
        result = mega.logout_account(mega_logout)
        if result.exit_code != 0:
            message = _command_message(result.stdout, result.stderr) or f"mega-logout failed with exit code {result.exit_code}."
            raise ExternalToolError(message)
        return self.mega_status()

    def import_file(
        self,
        path: Path,
        progress_callback: Callable[[ImportProgress], None] | None = None,
    ) -> ImportResult:
        """Imports a Record Tree workbook as the complete current library."""
        source_path = path.expanduser().resolve()
        if not source_path.exists():
            raise NotFoundError(f"Import source does not exist: {source_path}")
        extension = source_path.suffix.casefold()
        if extension not in IMPORT_FILE_EXTENSIONS:
            raise ValidationError(f"Unsupported import file extension: {extension}")
        importer = ExcelImporter()

        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        app_config.database_path.parent.mkdir(parents=True, exist_ok=True)
        app_config.logs_dir.mkdir(parents=True, exist_ok=True)

        conn = db.connect(app_config.database_path)
        try:
            db.initialize_schema(conn)
            import_repo = ImportRepository(conn)
            import_id = import_repo.create_import(source_path)
            conn.commit()
        except Exception:
            conn.close()
            raise
        stats = ImportStats()
        error_csv_path: Path | None = None
        status = "completed"
        notes: str | None = None
        report = _ImportProgressReporter(progress_callback, source_path)
        try:
            total_rows = importer.count_records(source_path)
            report("Importing", 0, total_rows)
            with db.transaction(conn):
                service = ImportService(conn)
                records = []
                for record in importer.iter_records(source_path):
                    stats.total_rows += 1
                    if isinstance(record, ImportRowError):
                        service.record_error(import_id, record)
                        stats.error_count += 1
                    else:
                        records.append(record)
                    report("Reading", stats.total_rows, total_rows)
                if not records:
                    raise ValidationError("Workbook has no valid rows, so the library was left unchanged.")
                read_rows = stats.total_rows
                summary = service.sync(
                    import_id,
                    records,
                    stats,
                    progress=lambda written, total: report("Writing", read_rows + written, read_rows + total),
                )
                status = "completed_with_errors" if stats.error_count else "completed"
                notes = _import_notes(importer.extra_columns, summary)
                import_repo.finish_import(import_id, stats, status, notes=notes)
            if stats.error_count:
                error_csv_path = _export_import_errors(conn, import_id, app_config.logs_dir)
        except Exception as error:
            import_repo.fail_import(import_id, str(error))
            conn.commit()
            raise
        finally:
            conn.close()

        return ImportResult(
            import_id=import_id,
            source_path=source_path,
            status=status,
            stats=stats,
            error_csv_path=error_csv_path,
            extra_columns=importer.extra_columns,
            notes=notes,
        )

    def list_imports(
        self,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
    ) -> ImportPage:
        normalized_page = normalize_page(page)
        normalized_page_size = normalize_limit(page_size)
        conn = self._open_app_db()
        try:
            repo = ImportRepository(conn)
            total = repo.count_imports(status=status)
            offset = (normalized_page - 1) * normalized_page_size
            items = repo.list_imports(normalized_page_size, offset, status=status)
            total_pages = (total + normalized_page_size - 1) // normalized_page_size if total else 0
            return ImportPage(items=items, page=normalized_page, page_size=normalized_page_size, total=total, total_pages=total_pages)
        finally:
            conn.close()

    def get_import(self, import_id: int):
        if import_id < 1:
            raise ValidationError("Import id must be at least 1.")
        conn = self._open_app_db()
        try:
            result = ImportRepository(conn).get_import(import_id)
            if result is None:
                raise NotFoundError(f"Import not found: {import_id}")
            return result
        finally:
            conn.close()

    def list_import_errors(self, import_id: int, page: int = 1, page_size: int = 100) -> ImportErrorPage:
        if import_id < 1:
            raise ValidationError("Import id must be at least 1.")
        normalized_page = normalize_page(page)
        normalized_page_size = normalize_limit(page_size)
        conn = self._open_app_db()
        try:
            repo = ImportRepository(conn)
            if repo.get_import(import_id) is None:
                raise NotFoundError(f"Import not found: {import_id}")
            total = repo.count_errors(import_id)
            offset = (normalized_page - 1) * normalized_page_size
            items = repo.list_error_details(import_id, normalized_page_size, offset)
            total_pages = (total + normalized_page_size - 1) // normalized_page_size if total else 0
            return ImportErrorPage(items=items, page=normalized_page, page_size=normalized_page_size, total=total, total_pages=total_pages)
        finally:
            conn.close()

    def stats(self) -> StatsResult:
        conn = self._open_app_db()
        try:
            return SearchService(conn).stats()
        finally:
            conn.close()

    def maintenance_summary(self) -> MaintenanceSummary:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        database_size = app_config.database_path.stat().st_size if app_config.database_path.exists() else None
        backup_dir = app_config.logs_dir / "backups"
        checks = self._local_maintenance_checks(config_path, app_config)
        return MaintenanceSummary(
            stats=self.stats(),
            checks=checks,
            ok=DoctorResult(checks).ok,
            database_path=app_config.database_path,
            database_size_bytes=database_size,
            backup_dir=backup_dir,
            latest_backup=_latest_backup(backup_dir),
            backups=_list_backups(backup_dir),
        )

    def _local_maintenance_checks(self, config_path: Path, app_config) -> list[DoctorCheck]:
        checks: list[DoctorCheck] = [DoctorCheck("config", "pass", str(config_path.resolve()))]
        try:
            conn = db.connect(app_config.database_path)
            try:
                version = conn.execute(
                    "SELECT value FROM schema_meta WHERE key = 'schema_version'"
                ).fetchone()
            finally:
                conn.close()
        except Exception as error:
            checks.append(DoctorCheck("database", "fail", str(error)))
            checks.append(DoctorCheck("schema", "fail", "Schema version could not be read."))
        else:
            checks.append(DoctorCheck("database", "pass", str(app_config.database_path)))
            if version is None:
                checks.append(DoctorCheck("schema", "fail", "schema_version is missing."))
            else:
                checks.append(DoctorCheck("schema", "pass", str(version["value"])))

        for name, path in _runtime_dirs(app_config):
            checks.append(_check_writable_dir(name, path))
        return checks

    def upload_dir(self) -> Path:
        """Directory under the cache where WebUI uploads are stored before import."""
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        upload_dir = app_config.cache_dir / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir

    def backup_database(self) -> BackupSummary:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        if not app_config.database_path.exists():
            raise ConfigError(f"Database file does not exist: {app_config.database_path}")
        backup_dir = app_config.logs_dir / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        created_at = _timestamp_for_filename()
        backup_path = backup_dir / f"recordtree-{created_at}.sqlite3"

        source = db.connect(app_config.database_path)
        target = sqlite3.connect(backup_path)
        try:
            source.backup(target)
            target.commit()
        finally:
            target.close()
            source.close()

        return BackupSummary(
            path=backup_path,
            size_bytes=backup_path.stat().st_size,
            created_at=created_at,
        )

    def list_backups(self) -> list[BackupSummary]:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        return _list_backups(app_config.logs_dir / "backups")

    def backup_path(self, filename: str) -> Path:
        if not filename.startswith("recordtree-") or not filename.endswith(".sqlite3"):
            raise ValidationError("Backup filename is not valid.")
        if Path(filename).name != filename:
            raise ValidationError("Backup filename must not include a path.")
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        backup_dir = (app_config.logs_dir / "backups").resolve()
        backup_path = (backup_dir / filename).resolve()
        if backup_dir not in backup_path.parents:
            raise ValidationError("Backup filename is outside the backup directory.")
        if not backup_path.exists() or not backup_path.is_file():
            raise NotFoundError(f"Backup not found: {filename}")
        return backup_path

    def database_integrity(self) -> IntegrityResult:
        conn = self._open_app_db()
        try:
            quick_check = str(conn.execute("PRAGMA quick_check").fetchone()[0])
            violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        finally:
            conn.close()
        checks = [
            DoctorCheck("quick_check", "pass" if quick_check == "ok" else "fail", quick_check),
            DoctorCheck(
                "foreign_key_check",
                "pass" if not violations else "fail",
                f"{len(violations)} violation(s)",
            ),
        ]
        return IntegrityResult(
            ok=quick_check == "ok" and not violations,
            quick_check=quick_check,
            foreign_key_violations=len(violations),
            checks=checks,
        )

    def orphan_report(self) -> OrphanReport:
        conn = self._open_app_db()
        try:
            counts = {
                "actors_without_records": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM actors a
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM record_group_actors rga
                        WHERE rga.actor_id = a.id
                    )
                    """,
                ),
                "sources_without_records": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM sources s
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM record_group_sources rgs
                        WHERE rgs.source_id = s.id
                    )
                    """,
                ),
                "record_actor_orphans": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM record_group_actors rga
                    WHERE NOT EXISTS (SELECT 1 FROM record_groups rg WHERE rg.id = rga.record_group_id)
                       OR NOT EXISTS (SELECT 1 FROM actors a WHERE a.id = rga.actor_id)
                    """,
                ),
                "record_source_orphans": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM record_group_sources rgs
                    WHERE NOT EXISTS (SELECT 1 FROM record_groups rg WHERE rg.id = rgs.record_group_id)
                       OR NOT EXISTS (SELECT 1 FROM sources s WHERE s.id = rgs.source_id)
                    """,
                ),
                "links_without_record": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM download_links dl
                    WHERE NOT EXISTS (SELECT 1 FROM record_groups rg WHERE rg.id = dl.record_group_id)
                    """,
                ),
                "downloads_without_record": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM downloads d
                    WHERE NOT EXISTS (SELECT 1 FROM record_groups rg WHERE rg.id = d.record_group_id)
                    """,
                ),
                "download_items_without_download": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM download_items di
                    WHERE NOT EXISTS (SELECT 1 FROM downloads d WHERE d.id = di.download_id)
                    """,
                ),
                "download_items_without_link": _count_sql(
                    conn,
                    """
                    SELECT COUNT(*)
                    FROM download_items di
                    WHERE NOT EXISTS (SELECT 1 FROM download_links dl WHERE dl.id = di.link_id)
                    """,
                ),
            }
        finally:
            conn.close()
        return OrphanReport(
            ok=all(value == 0 for value in counts.values()),
            **counts,
        )

    def analyze_database(self) -> MaintenanceActionResult:
        started_at = _utc_iso()
        conn = self._open_app_db()
        try:
            conn.execute("ANALYZE")
            conn.commit()
        finally:
            conn.close()
        finished_at = _utc_iso()
        return MaintenanceActionResult(
            ok=True,
            message="SQLite query planner statistics refreshed.",
            started_at=started_at,
            finished_at=finished_at,
        )

    def vacuum_database(self) -> MaintenanceActionResult:
        started_at = _utc_iso()
        conn = self._open_app_db()
        try:
            conn.execute("VACUUM")
        finally:
            conn.close()
        finished_at = _utc_iso()
        return MaintenanceActionResult(
            ok=True,
            message="SQLite database vacuum completed.",
            started_at=started_at,
            finished_at=finished_at,
        )

    def search_actor(self, name: str, limit: int = 50) -> list[ActorSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).search_actor(name, limit)
        finally:
            conn.close()

    def list_actor_page(
        self,
        name: str = "",
        page: int = 1,
        page_size: int = 50,
        *,
        sort: str = "name_asc",
        favorites_only: bool = False,
        favorites_first: bool = False,
    ) -> ActorPage:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_actor_page(
                name,
                page=page,
                page_size=page_size,
                sort=sort,
                favorites_only=favorites_only,
                favorites_first=favorites_first,
            )
        finally:
            conn.close()

    def set_actor_favorite(self, actor_id: int, favorite: bool) -> ActorSummary:
        conn = self._open_app_db()
        try:
            search = SearchService(conn)
            search.require_actor(actor_id)
            ActorRepository(conn).set_favorite(actor_id, favorite)
            conn.commit()
            return search.get_actor(actor_id)
        finally:
            conn.close()

    def actor_undownloaded_counts(self, actor_ids: list[int]) -> dict[int, int]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).actor_undownloaded_counts(actor_ids)
        finally:
            conn.close()

    def get_actor(self, actor_id: int) -> ActorSummary:
        conn = self._open_app_db()
        try:
            return SearchService(conn).get_actor(actor_id)
        finally:
            conn.close()

    def list_actor_records(self, actor_id: int, limit: int = 50) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_actor_records(actor_id, limit)
        finally:
            conn.close()

    def search_platform(self, name: str, limit: int = 50) -> list[SourceSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).search_platform(name, limit)
        finally:
            conn.close()

    def list_platform_page(self, name: str = "", page: int = 1, page_size: int = 50) -> SourcePage:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_platform_page(name, page=page, page_size=page_size)
        finally:
            conn.close()

    def platform_undownloaded_counts(self, source_ids: list[int]) -> dict[int, int]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).platform_undownloaded_counts(source_ids)
        finally:
            conn.close()

    def get_platform(self, source_id: int) -> SourceSummary:
        conn = self._open_app_db()
        try:
            return SearchService(conn).get_platform(source_id)
        finally:
            conn.close()

    def list_platform_records(self, source_id: int, limit: int = 50) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_platform_records(source_id, limit)
        finally:
            conn.close()

    def list_records(
        self,
        *,
        record_id: int | None = None,
        title: str = "",
        actor: str = "",
        actor_id: int | None = None,
        source: str = "",
        date_from: str | None = None,
        date_to: str | None = None,
        downloaded: str | None = None,
        file_type: str | None = None,
        only_undownloaded: bool = False,
        page: int = 1,
        page_size: int = 50,
        sort: str = "delivered_desc",
    ) -> RecordPage:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_records(
                record_id=record_id,
                title=title,
                actor=actor,
                actor_id=actor_id,
                source=source,
                date_from=date_from,
                date_to=date_to,
                downloaded=downloaded,
                file_type=file_type,
                only_undownloaded=only_undownloaded,
                page=page,
                page_size=page_size,
                sort=sort,
            )
        finally:
            conn.close()

    def record_status_counts(
        self,
        *,
        record_id: int | None = None,
        title: str = "",
        actor: str = "",
        actor_id: int | None = None,
        source: str = "",
        date_from: str | None = None,
        date_to: str | None = None,
        file_type: str | None = None,
    ) -> dict[str, int]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).record_status_counts(
                record_id=record_id,
                title=title,
                actor=actor,
                actor_id=actor_id,
                source=source,
                date_from=date_from,
                date_to=date_to,
                file_type=file_type,
            )
        finally:
            conn.close()

    def search_title(self, keyword: str, limit: int = 50) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).search_title(keyword, limit)
        finally:
            conn.close()

    def search_source(self, source: str, limit: int = 50) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).search_source(source, limit)
        finally:
            conn.close()

    def search_date(
        self,
        date_from: str | None,
        date_to: str | None,
        limit: int = 50,
    ) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).search_date(date_from, date_to, limit)
        finally:
            conn.close()

    def list_undownloaded(
        self,
        actor: str | None = None,
        source: str | None = None,
        limit: int = 50,
        actor_id: int | None = None,
    ) -> list[RecordSummary]:
        conn = self._open_app_db()
        try:
            return SearchService(conn).list_undownloaded(actor=actor, actor_id=actor_id, source=source, limit=limit)
        finally:
            conn.close()

    def info(self, record_id_or_key: str) -> RecordDetail:
        conn = self._open_app_db()
        try:
            return SearchService(conn).get_info(record_id_or_key)
        finally:
            conn.close()

    def build_download_plan(
        self,
        record_id_or_key: str,
        include_par2: bool = False,
        types: str | None = None,
        output: Path | None = None,
        only_undownloaded: bool = False,
        link_ids: Sequence[int] | None = None,
    ) -> DownloadPlan:
        app_config = config_module.load_config(config_module.default_config_path())
        conn = self._open_app_db()
        try:
            return SearchService(conn).build_download_plan(
                record_id_or_key=record_id_or_key,
                downloads_dir=app_config.downloads_dir,
                include_par2_by_default=app_config.include_par2_by_default,
                include_par2=include_par2,
                type_filter_text=types,
                output_dir=output,
                folder_template=app_config.folder_template,
                safety_margin_percent=app_config.safety_margin_percent,
                safety_margin_min_mb=app_config.safety_margin_min_mb,
                only_undownloaded=only_undownloaded,
                link_ids=link_ids,
            )
        finally:
            conn.close()

    def download(
        self,
        record_id_or_key: str,
        include_par2: bool = False,
        types: str | None = None,
        output: Path | None = None,
        assume_yes: bool = False,
        confirm_callback=None,
        only_undownloaded: bool = False,
        output_callback: Callable[[str], None] | None = None,
        link_ids: Sequence[int] | None = None,
    ) -> DownloadExecutionResult:
        app_config = config_module.load_config(config_module.default_config_path())
        plan = self.build_download_plan(record_id_or_key, include_par2, types, output, only_undownloaded, link_ids)
        request_json = _download_request_json(
            kind="record",
            record_id_or_key=record_id_or_key,
            include_par2=include_par2,
            types=types,
            output=plan.output_dir,
            only_undownloaded=only_undownloaded,
            link_ids=link_ids,
        )
        conn = self._open_app_db()
        downloads = DownloadRepository(conn)
        try:
            try:
                mega_whoami = mega.resolve_executable(app_config.mega_whoami)
                mega_get = mega.resolve_executable(app_config.mega_get)
            except ExternalToolError as error:
                download_id = downloads.create_from_plan(plan, "blocked", str(error), request_json=request_json)
                conn.commit()
                return DownloadExecutionResult(
                    download_id=download_id,
                    record_group_id=plan.record_group_id,
                    status="blocked",
                    completed=0,
                    failed=0,
                    output_dir=plan.output_dir,
                    message=str(error),
                )

            login = mega.check_login(mega_whoami)
            if not login.logged_in:
                message = "MEGA is not logged in. Use Settings or run mega-login."
                download_id = downloads.create_from_plan(plan, "blocked", message, request_json=request_json)
                conn.commit()
                return DownloadExecutionResult(
                    download_id=download_id,
                    record_group_id=plan.record_group_id,
                    status="blocked",
                    completed=0,
                    failed=0,
                    output_dir=plan.output_dir,
                    message=message,
                )

            if plan.free_bytes_before is not None and plan.free_bytes_before < plan.required_bytes:
                message = (
                    f"Insufficient disk space: required={plan.required_bytes} "
                    f"free={plan.free_bytes_before}"
                )
                download_id = downloads.create_from_plan(plan, "blocked", message, request_json=request_json)
                conn.commit()
                return DownloadExecutionResult(
                    download_id=download_id,
                    record_group_id=plan.record_group_id,
                    status="blocked",
                    completed=0,
                    failed=0,
                    output_dir=plan.output_dir,
                    message=message,
                )

            if not assume_yes and confirm_callback is not None and not confirm_callback(plan):
                download_id = downloads.create_from_plan(
                    plan,
                    "cancelled",
                    "Cancelled by user.",
                    request_json=request_json,
                )
                conn.commit()
                return DownloadExecutionResult(
                    download_id=download_id,
                    record_group_id=plan.record_group_id,
                    status="cancelled",
                    completed=0,
                    failed=0,
                    output_dir=plan.output_dir,
                    message="Cancelled by user.",
                )

            plan.output_dir.mkdir(parents=True, exist_ok=True)
            download_id = downloads.create_from_plan(plan, "planned", request_json=request_json)
            log_path = _download_log_path(app_config.logs_dir, download_id)
            downloads.set_download_log_path(download_id, log_path)
            log_callback = _download_output_logger(log_path, output_callback)
            items = [(link, downloads.create_download_item(download_id, link.id)) for link in plan.selected_links]
            conn.commit()
            completed = 0
            failed = 0
            last_exit_code: int | None = None
            downloads.update_download_status(download_id, "running")
            for link, item_id in items:
                downloads.start_download_item(item_id)
                # Persist recovery state and release SQLite's writer lock before MEGAcmd runs.
                conn.commit()
                try:
                    result = mega.download_link(
                        mega_get,
                        link.mega_url,
                        plan.output_dir,
                        output_callback=log_callback,
                    )
                except Exception as error:
                    result = MegaCommandResult(1, "", str(error))
                last_exit_code = result.exit_code
                message = _command_message(result.stdout, result.stderr)
                if result.exit_code == 0:
                    completed += 1
                    downloads.finish_download_item(item_id, "completed", result.exit_code, message)
                else:
                    failed += 1
                    downloads.finish_download_item(item_id, "failed", result.exit_code, message)
                conn.commit()

            status = "completed" if failed == 0 else "failed"
            downloads.update_download_status(
                download_id,
                status,
                last_exit_code,
                f"completed={completed} failed={failed}",
            )
            conn.commit()
            return DownloadExecutionResult(
                download_id=download_id,
                record_group_id=plan.record_group_id,
                status=status,
                completed=completed,
                failed=failed,
                output_dir=plan.output_dir,
            )
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def mark_interrupted_downloads(self) -> int:
        conn = self._open_app_db()
        try:
            changed = DownloadRepository(conn).mark_interrupted_downloads(_interrupted_message())
            conn.commit()
            return changed
        finally:
            conn.close()

    def web_settings(self) -> dict[str, object]:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        return {
            "paths": {
                "downloads": _relative_or_absolute(app_config.downloads_dir),
            },
            "download": {
                "folder_template": app_config.folder_template,
                "safety_margin_percent": app_config.safety_margin_percent,
                "minimum_free_space_mb": app_config.safety_margin_min_mb,
                "include_par2_by_default": app_config.include_par2_by_default,
            },
            "variables": allowed_download_template_variables(),
        }

    def update_web_settings(
        self,
        *,
        folder_template: str,
        safety_margin_percent: int,
        minimum_free_space_mb: int,
        include_par2_by_default: bool,
    ) -> dict[str, object]:
        config_path = config_module.ensure_config(config_module.default_config_path())
        app_config = config_module.load_config(config_path)
        if safety_margin_percent < 0:
            raise ValidationError("Safety margin percent must be non-negative.")
        if minimum_free_space_mb < 0:
            raise ValidationError("Minimum free space must be non-negative.")
        normalized_template = normalize_download_folder_template(folder_template)
        updated = replace(
            app_config,
            safety_margin_percent=safety_margin_percent,
            safety_margin_min_mb=minimum_free_space_mb,
            include_par2_by_default=include_par2_by_default,
            folder_template=normalized_template,
        )
        config_module.save_config(config_path, updated)
        return self.web_settings()

    def list_downloads(
        self,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
        record_id: int | None = None,
    ) -> DownloadPage:
        normalized_page = normalize_page(page)
        normalized_page_size = normalize_limit(page_size)
        if record_id is not None and record_id < 1:
            raise ValidationError("Record id must be at least 1.")
        conn = self._open_app_db()
        try:
            repo = DownloadRepository(conn)
            total = repo.count_downloads(status=status, record_id=record_id)
            offset = (normalized_page - 1) * normalized_page_size
            items = repo.list_downloads(
                normalized_page_size,
                offset,
                status=status,
                record_id=record_id,
            )
            total_pages = (total + normalized_page_size - 1) // normalized_page_size if total else 0
            return DownloadPage(items=items, page=normalized_page, page_size=normalized_page_size, total=total, total_pages=total_pages)
        finally:
            conn.close()

    def get_download(self, download_id: int):
        if download_id < 1:
            raise ValidationError("Download id must be at least 1.")
        conn = self._open_app_db()
        try:
            result = DownloadRepository(conn).get_download(download_id)
            if result is None:
                raise NotFoundError(f"Download not found: {download_id}")
            return result
        finally:
            conn.close()

    def get_download_log(self, download_id: int) -> str:
        detail = self.get_download(download_id)
        if not detail.log_path:
            raise NotFoundError(f"Download log not found: {download_id}")
        app_config = config_module.load_config(config_module.default_config_path())
        logs_dir = app_config.logs_dir.resolve()
        log_path = Path(detail.log_path).expanduser().resolve()
        try:
            log_path.relative_to(logs_dir)
        except ValueError as error:
            raise ValidationError(f"Download {download_id} has an invalid log path.") from error
        if not log_path.is_file():
            raise NotFoundError(f"Download log file is missing: {download_id}")
        with log_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
            return handle.read()

    def get_download_resume_request(self, download_id: int) -> dict[str, object]:
        detail = self.get_download(download_id)
        if not detail.request_json:
            raise ValidationError(f"Download {download_id} does not have resumable request metadata.")
        try:
            payload = json.loads(detail.request_json)
        except json.JSONDecodeError as error:
            raise ValidationError(f"Download {download_id} has invalid request metadata.") from error
        if not isinstance(payload, dict) or payload.get("kind") != "record":
            raise ValidationError(f"Download {download_id} cannot be resumed from this request type.")
        record_id_or_key = payload.get("record_id_or_key")
        if not isinstance(record_id_or_key, str) or not record_id_or_key.strip():
            raise ValidationError(f"Download {download_id} has invalid resume target.")
        link_ids = payload.get("link_ids")
        if link_ids is not None and (
            not isinstance(link_ids, list) or not all(type(link_id) is int for link_id in link_ids)
        ):
            raise ValidationError(f"Download {download_id} has invalid selected links.")
        return {
            "record_id_or_key": record_id_or_key,
            "include_par2": bool(payload.get("include_par2", False)),
            "types": payload.get("types") if isinstance(payload.get("types"), str) else None,
            "output": payload.get("output") if isinstance(payload.get("output"), str) else None,
            # Resuming chosen links finishes the ones not downloaded yet, even when the
            # original request re-downloaded completed links on purpose.
            "only_undownloaded": True if link_ids is not None else bool(payload.get("only_undownloaded", True)),
            "link_ids": link_ids,
        }

    def list_download_items(self, download_id: int) -> list[DownloadItemDetail]:
        if download_id < 1:
            raise ValidationError("Download id must be at least 1.")
        conn = self._open_app_db()
        try:
            repo = DownloadRepository(conn)
            if repo.get_download(download_id) is None:
                raise NotFoundError(f"Download not found: {download_id}")
            return repo.list_download_items(download_id)
        finally:
            conn.close()

    def download_actor(
        self,
        actor_id: int,
        limit: int = 3,
        include_par2: bool = False,
        types: str | None = None,
        output: Path | None = None,
        assume_yes: bool = False,
        confirm_callback=None,
        output_callback: Callable[[str], None] | None = None,
    ) -> ActorDownloadResult:
        records = self.list_undownloaded(actor_id=actor_id, limit=limit)
        if not records:
            return ActorDownloadResult(
                actor_id=actor_id,
                selected_count=0,
                results=[],
                message=f"No undownloaded records found for actor id {actor_id}.",
            )

        results: list[DownloadExecutionResult] = []
        for record in records:
            record_output = (output / str(record.id)) if output is not None else None
            results.append(
                self.download(
                    str(record.id),
                    include_par2=include_par2,
                    types=types,
                    output=record_output,
                    assume_yes=assume_yes,
                    confirm_callback=confirm_callback,
                    only_undownloaded=True,
                    output_callback=output_callback,
                )
            )
        return ActorDownloadResult(
            actor_id=actor_id,
            selected_count=len(records),
            results=results,
        )

    def _open_app_db(self):
        app_config = config_module.load_config(config_module.default_config_path())
        if not app_config.database_path.exists():
            raise ConfigError(f"Database file does not exist: {app_config.database_path}")
        conn = db.connect(app_config.database_path)
        try:
            db.require_supported_schema(conn)
        except Exception:
            conn.close()
            raise
        return conn


class _ImportProgressReporter:
    """Forwards import progress about IMPORT_PROGRESS_STEPS times per phase, plus each phase's last row."""

    def __init__(self, callback: Callable[[ImportProgress], None] | None, source_path: Path) -> None:
        self.callback = callback
        self.source_path = source_path
        self.phase: str | None = None
        self.last_reported = 0

    def __call__(self, phase: str, completed_rows: int, total_rows: int | None) -> None:
        if self.callback is None:
            return
        step = max(1, (total_rows or 0) // IMPORT_PROGRESS_STEPS) if total_rows else 1
        is_new_phase = phase != self.phase
        if not is_new_phase and completed_rows != total_rows and completed_rows - self.last_reported < step:
            return
        self.phase = phase
        self.last_reported = completed_rows
        self.callback(
            ImportProgress(
                source_path=self.source_path,
                completed_rows=completed_rows,
                total_rows=total_rows,
                phase=phase,
            )
        )


def _import_notes(extra_columns: tuple[str, ...], summary: SyncSummary) -> str | None:
    notes: list[str] = []
    if extra_columns:
        notes.append("Extra Excel columns ignored: " + ", ".join(extra_columns))
    if summary.duplicate_rows_merged:
        notes.append(
            f"Duplicate Excel records merged: {summary.duplicate_source_keys} source keys, "
            f"{summary.duplicate_rows_merged} extra rows"
        )
    return "; ".join(notes) if notes else None


def _relative_or_absolute(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path)


def _export_import_errors(conn, import_id: int, logs_dir: Path) -> Path:
    logs_dir.mkdir(parents=True, exist_ok=True)
    path = logs_dir / f"import_{import_id}_errors.csv"
    rows = ImportRepository(conn).list_errors(import_id)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "import_id",
                "row_number",
                "source_key",
                "error_type",
                "message",
                "raw_value",
                "created_at",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row["import_id"],
                    row["row_number"],
                    row["source_key"],
                    row["error_type"],
                    row["message"],
                    row["raw_value"],
                    row["created_at"],
                ]
            )
    return path


def _runtime_dirs(app_config) -> tuple[tuple[str, Path], ...]:
    return (
        ("downloads_dir", app_config.downloads_dir),
        ("logs_dir", app_config.logs_dir),
        ("cache_dir", app_config.cache_dir),
    )


def _check_writable_dir(name: str, path: Path) -> DoctorCheck:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".recordtree_write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as error:
        return DoctorCheck(name, "fail", str(error))
    return DoctorCheck(name, "pass", str(path))


def _check_executable(name: str, configured: str) -> tuple[DoctorCheck, str | None]:
    try:
        resolved = mega.resolve_executable(configured)
    except ExternalToolError as error:
        return DoctorCheck(name, "fail", str(error)), None
    return DoctorCheck(name, "pass", resolved), resolved


def _mega_command_status(configured: str) -> MegaCommandStatus:
    try:
        resolved = mega.resolve_executable(configured)
    except ExternalToolError as error:
        return MegaCommandStatus(
            configured=configured,
            resolved=None,
            available=False,
            message=str(error),
        )
    return MegaCommandStatus(
        configured=configured,
        resolved=resolved,
        available=True,
        message=resolved,
    )


def _megacmd_persistence_dir() -> Path:
    home = Path.home()
    if os.name != "nt" and home == Path("/root"):
        return home
    return home / ".megaCmd"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _timestamp_for_filename() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _latest_backup(backup_dir: Path) -> BackupSummary | None:
    backups = _list_backups(backup_dir)
    return backups[0] if backups else None


def _list_backups(backup_dir: Path) -> list[BackupSummary]:
    if not backup_dir.exists():
        return []
    backup_paths = sorted(backup_dir.glob("recordtree-*.sqlite3"), key=lambda path: path.stat().st_mtime, reverse=True)
    return [
        BackupSummary(
            path=path,
            size_bytes=path.stat().st_size,
            created_at=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
        )
        for path in backup_paths
    ]


def _count_sql(conn, sql: str) -> int:
    return int(conn.execute(sql).fetchone()[0])


def _download_request_json(
    *,
    kind: str,
    record_id_or_key: str,
    include_par2: bool,
    types: str | None,
    output: Path,
    only_undownloaded: bool,
    link_ids: Sequence[int] | None = None,
) -> str:
    return json.dumps(
        {
            "kind": kind,
            "record_id_or_key": record_id_or_key,
            "include_par2": include_par2,
            "types": types,
            "output": str(output),
            "only_undownloaded": only_undownloaded,
            "link_ids": sorted(set(link_ids)) if link_ids is not None else None,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _download_log_path(logs_dir: Path, download_id: int) -> Path:
    return logs_dir / "downloads" / f"download_{download_id}.log"


def _download_output_logger(
    log_path: Path,
    output_callback: Callable[[str], None] | None,
) -> Callable[[str], None]:
    log_path.parent.mkdir(parents=True, exist_ok=True)

    def callback(chunk: str) -> None:
        with log_path.open("a", encoding="utf-8", errors="replace", newline="") as handle:
            handle.write(chunk)
        if output_callback is not None:
            output_callback(chunk)

    return callback


def _interrupted_message() -> str:
    return "Interrupted by application startup recovery; resume to continue the same MEGAcmd download."


def _command_message(stdout: str, stderr: str) -> str | None:
    message = "\n".join(part for part in (stdout, stderr) if part)
    return message or None
