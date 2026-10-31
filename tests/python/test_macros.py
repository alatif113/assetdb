"""Static checks on default/macros.conf."""
import os
import re

MACROS = os.path.join(os.path.dirname(__file__), "..", "..", "default", "macros.conf")


def macro_definition(stanza):
    """First `definition =` line of a stanza (conf continuation lines are not needed here)."""
    text = open(MACROS).read()
    body = re.search(r"^\[%s\]\n(.*?)(?=^\[|\Z)" % re.escape(stanza), text, re.S | re.M).group(1)
    return re.search(r"^definition\s*=\s*(.*)$", body, re.M).group(1)


def test_input_macro_defaults_source_lookup():
    # Lookups that were not written by output_adb_lookup have no source_lookup column;
    # without a default their rows get a null `source`.
    definition = macro_definition("input_adb_lookup(1)")
    assert definition.startswith("inputlookup append=true $lookup$")
    assert 'source_lookup=coalesce(source_lookup, "$lookup$")' in definition


def _normalize_os_rules():
    """(regex, result) pairs of the normalize_os case() in order; (?i:...) scoped flags work in Python 3.6+."""
    text = open(MACROS).read()
    body = re.search(r"^\[normalize_os\(1\)\]\n(.*?)(?=^\[|\Z)", text, re.S | re.M).group(1)
    return [(m.group(1), m.group(2)) for m in re.finditer(r'match\(\$os\$, "([^"]+)"\), "([^"]+)"', body)]


def normalize_os(value):
    for pattern, result in _normalize_os_rules():
        if re.search(pattern, value):
            return result
    return value


def test_normalize_os_known_values():
    cases = {
        "iOS 16.1": "ios", "iPhone OS": "ios", "iPadOS 17": "ipados", "macOS Sonoma": "macos", "Mac OS X": "macos",
        "OS X 10.15 Catalina": "macos", "Darwin 23": "macos", "Android 14": "android", "CentOS 7": "centos",
        "Ubuntu 22.04": "ubuntu", "Debian 12": "debian", "Red Hat Enterprise Linux": "redhat", "RHEL 9": "redhat",
        "SUSE Linux": "suse_linux", "Linux": "linux", "Windows Server 2019": "windows_server",
        "Windows2016": "windows_server", "Windows 11": "windows", "VMware ESXi": "esxi", "F5 BIG-IP": "f5",
        "Cisco ASA": "asa", "Plan 9": "Plan 9",
    }
    for raw, expected in cases.items():
        assert normalize_os(raw) == expected, raw
