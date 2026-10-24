.PHONY: python-install python-lint python-test web-install web-build web-dev scripts-test sensitive-check actionlint docker-build dependency-audit
.PHONY: ci-style ci-python ci-web ci

ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
else
PYTHON ?= python3
endif
NPM ?= npm
NODE ?= node
GO ?= go
DOCKER ?= docker
DOCKER_IMAGE ?= recordtree:dev
ACTIONLINT_VERSION ?= v1.7.12

python-install:
	$(PYTHON) -m pip install -e ".[dev]"

python-lint:
	$(PYTHON) -m ruff check recordtree tests scripts

python-test:
	$(PYTHON) -m pytest

web-install:
	cd web && $(NPM) ci

# The build runs tsc -b first, so it is also the frontend type check.
web-build: web-install
	cd web && $(NPM) run build

web-dev: web-install
	cd web && $(NPM) run dev

scripts-test:
	$(NODE) --test scripts/check-sensitive.test.mjs

# Scans the working-tree diff against HEAD plus untracked files. Run it before
# every commit; it is deliberately not part of the CI sequence.
sensitive-check:
	$(NODE) scripts/check-sensitive.mjs

actionlint:
	$(GO) run github.com/rhysd/actionlint/cmd/actionlint@$(ACTIONLINT_VERSION)

docker-build:
	$(DOCKER) build -t $(DOCKER_IMAGE) .

# Reports known npm advisories; not part of the CI gate.
dependency-audit:
	cd web && $(NPM) audit --audit-level=moderate

ci-style: python-lint scripts-test actionlint
ci-python: python-test
ci-web: web-build
ci: ci-style ci-python ci-web docker-build
