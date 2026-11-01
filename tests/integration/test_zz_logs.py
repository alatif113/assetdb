"""Runs last (alphabetical): no unexpected ERROR/WARN lines mentioning assetdb/adbmerge since the run began."""
import time

# adbmerge logs these on every run by design.
EXPECTED = ("Ignored ", "assets with null keys", "assets which share more than")


def test_no_unexpected_assetdb_errors_in_internal_logs(splunk, run_started):
    time.sleep(5)  # let indexing catch up
    rows = splunk.search(
        'index=_internal (source=*splunkd.log OR source=*python.log OR source=*splunk_python.log OR source=*searchcommands_app.log) '
        '(assetdb OR adbmerge) (log_level=ERROR OR log_level=WARN OR log_level=WARNING OR " ERROR " OR " WARN ") '
        '| table _time source log_level _raw',
        earliest=str(run_started), latest="now")
    unexpected = [r for r in rows if not any(e in r.get("_raw", "") for e in EXPECTED)]
    assert not unexpected, "unexpected log lines:\n" + "\n".join(r.get("_raw", "")[:300] for r in unexpected[:20])
