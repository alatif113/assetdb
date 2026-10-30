SHELL := /bin/bash
VENV  := .venv
PY    := $(VENV)/bin/python

.PHONY: help venv test test-py test-js check-minjs package inspect deploy reload integration e2e all clean

help:
	@echo "targets: test package inspect deploy reload integration e2e all clean"

$(PY): requirements-dev.txt
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -r requirements-dev.txt
	@touch $(PY)

venv: $(PY)

test: test-py test-js check-minjs

test-py: $(PY)
	$(PY) -m pytest

test-js:
	node --test tests/js/

check-minjs:
	scripts/check-minjs.sh

package:
	scripts/package.sh

inspect:
	scripts/appinspect.sh

deploy:
	scripts/deploy.sh

reload:
	scripts/reload.sh

integration: $(PY)
	$(PY) -m pytest tests/integration -m integration -c /dev/null --rootdir .

e2e:
	scripts/e2e.sh

all:
	scripts/test-all.sh

clean:
	rm -rf dist coverage .coverage .pytest_cache
