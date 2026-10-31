"""The normalize_* macros evaluated by a real Splunk, on multivalue fields (what the generator feeds them)."""
import pytest

CASES = {
    "normalize_trim": [("  a b  ", "a b")],
    "normalize_mac": [("AA-BB-CC-DD-EE-FF", "aa:bb:cc:dd:ee:ff"), ("aabb.ccdd.eeff", "aa:bb:cc:dd:ee:ff"),
                      ("AABBCCDDEEFF", "aa:bb:cc:dd:ee:ff"), ("aa:bb:cc:dd:ee:ff", "aa:bb:cc:dd:ee:ff"), ("not a mac", "not a mac")],
    "normalize_ip": [(" 010.001.000.005 ", "10.1.0.5"), ("10.1.2.3", "10.1.2.3"), ("FE80::1", "fe80::1")],
    "normalize_hostname": [("HOST-A.corp.example.com", "host-a"), ("host-b", "host-b"), ("10.1.2.3", "10.1.2.3")],
    "normalize_fqdn": [("HOST-A.Corp.Example.com.", "host-a.corp.example.com")],
    "normalize_user": [("CORP\\JDoe", "jdoe"), ("JDoe@corp.example.com", "jdoe"), ("plain", "plain")],
    "normalize_email": [(" Jane.Doe@Corp.com ", "jane.doe@corp.com")],
    "normalize_os": [("Mac OS X 10.15", "macos"), ("Windows Server 2019", "windows_server"), ("Ubuntu 22.04", "ubuntu"), ("Plan 9", "Plan 9")],
}


@pytest.mark.parametrize("macro", sorted(CASES))
def test_macro_normalizes_every_value_of_a_multivalue_field(splunk, macro):
    values = [raw for raw, _ in CASES[macro]]
    expected = [want for _, want in CASES[macro]]
    # one result row per value pair so a bad value cannot hide another; the pipe-split mirrors the generator
    spl = ('| makeresults | eval f=split(%s, "~~") | `%s(f)` | eval n=mvcount(f)' %
           ('"%s"' % "~~".join(values).replace("\\", "\\\\"), macro))
    rows = splunk.search(spl)
    got = rows[0]["f"]
    got = got if isinstance(got, list) else [got]
    assert got == expected
