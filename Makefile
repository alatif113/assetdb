SHELL := /bin/bash
VENV  := .venv
PY    := $(VENV)/bin/python

.PHONY: help venv test test-sh lint-sh test-py test-js check-minjs check-viz lint lint-js lint-py package inspect deploy reload integration e2e all clean

help:
	@echo "targets: test lint package inspect deploy reload integration e2e all clean"

$(PY): requirements-dev.txt
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -r requirements-dev.txt
	@touch $(PY)

venv: $(PY)

test: test-py test-js check-minjs check-viz test-sh lint

test-py: $(PY)
	$(PY) -m pytest

test-js:
	node --test "tests/js/*.test.js"

test-sh:
	tests/shell/deploy-mock-test.sh

lint: lint-sh lint-js lint-py

lint-sh: $(PY)
	$(VENV)/bin/shellcheck -x scripts/*.sh tests/shell/*.sh

lint-js:
	npx eslint --max-warnings 100 .

lint-py: $(PY)
	$(VENV)/bin/ruff check .

check-minjs:
	scripts/check-minjs.sh

check-viz:
	scripts/check-viz.sh

package:
	scripts/package.sh

inspect:
	scripts/appinspect.sh

deploy:
	scripts/deploy.sh

reload:
	scripts/reload.sh

integration: $(PY)
	$(PY) -m pytest tests/integration -c pytest.ini --rootdir . -o testpaths=tests/integration -p no:cacheprovider

e2e:
	scripts/e2e.sh

all:
	scripts/test-all.sh

clean:
	rm -rf dist coverage .coverage .pytest_cache
