# RecordTree

RecordTree 是一个本地优先的 Record Tree 元数据管理和下载工具。它可以把 Record Tree 的 Excel 导出导入 SQLite，支持搜索记录，并通过 MEGAcmd 下载选中的 MEGA 链接。

本工具不抓取远程来源，也不保存 MEGA 凭据。MEGA 登录状态由 MEGAcmd 自行管理。

## 功能

- 导入 Record Tree 的 Excel 导出；每次导入都会让资料库与表格保持一致，并保留下载状态。
- 按演员、标题、来源、日期范围和下载状态搜索。
- 查看记录组、活动链接和下载状态。
- 通过 MEGAcmd 下载链接。
- 支持 CLI 和 Docker WebUI。

## 快速开始

### Docker WebUI

在一个空目录中下载 [`docker-compose.yml`](docker-compose.yml)，然后启动已发布的镜像。镜像标签、时区和数据目录的说明见 [Docker 部署](docs/user-guide/docker.md)。

```bash
curl -fsSLO https://raw.githubusercontent.com/yexca/recordtree/main/docker-compose.yml
docker compose up -d
docker compose exec recordtree-web recordtree init
docker compose exec recordtree-web mega-login
docker compose exec recordtree-web recordtree doctor
```

打开：

```text
http://127.0.0.1:7647
```

### CLI

Windows 下可以运行：

```bat
run-install.bat
```

如果 `PATH` 中没有 uv，它会把 uv 安装到 `env/uv`，然后按 `.python-version` 中的 Python 版本，根据 `uv.lock` 创建 `.venv`。

然后初始化并检查环境：

```powershell
.\.venv\Scripts\recordtree.exe init
.\.venv\Scripts\recordtree.exe doctor
```

## 文档

- [文档索引](docs/README.md)
- [CLI 使用指南](docs/user-guide/cli.md)
- [WebUI 使用指南](docs/user-guide/webui.md)
- [Docker 部署](docs/user-guide/docker.md)
- [故障排查](docs/user-guide/troubleshooting.md)
- [架构](docs/maintainer-guide/architecture.md)
- [数据契约](docs/maintainer-guide/data-contract.md)
- [测试指南](docs/maintainer-guide/testing.md)

## 安全说明

- 不要提交真实导出、下载文件、MEGA 凭据或运行时数据库。
- 敏感的手动测试资料请放在 `real_test/`，该目录已被 Git 忽略。
- `config/` 保存数据库、日志；Docker WebUI 运行时还在 `config/mega` 中保存 MEGAcmd 登录会话。请把它当作敏感数据。
- `env/` 只存放可以重新生成的文件，例如 `run-install.bat` 安装的 uv 和 Python 运行时。删除它不会丢失数据。

## 许可证

RecordTree 使用 GNU Affero General Public License 第 3 版（仅限此版本，`AGPL-3.0-only`）。完整条款见 [LICENSE](LICENSE)。
