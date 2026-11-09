"""Static checks on default/macros.conf."""
import os
import re

MACROS = os.path.join(os.path.dirname(__file__), "..", "..", "default", "macros.conf")


def macro_definition(stanza):
    """First `definition =` line of a stanza (conf continuation lines are not needed here)."""
    text = open(MACROS).read()
    body = re.search(r"^\[%s\]\n(.*?)(?=^\[|\Z)" % re.escape(stanza), text, re.S | re.M).group(1)
    return re.search(r"^definition\s*=\s*(.*)$", body, re.M).group(1)


def test_input_macro_names_the_lookup_whatever_its_columns_say():
    # A source lookup can carry a source_lookup column of its own (a copy of a merged result, or a renamed file). Its rows must still count as
    # coming from the lookup the macro read: the marker adb_src is set only on rows that do not have it yet (the rows of the earlier lookups
    # of the chain), and source_lookup always follows it.
    definition = macro_definition("input_adb_lookup(1)")
    assert definition.startswith("inputlookup append=true $lookup$")
    assert 'adb_src=coalesce(adb_src, "$lookup$")' in definition
    assert definition.rstrip().endswith("source_lookup=adb_src")
    assert "coalesce(source_lookup" not in definition


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


def _os_family_rules():
    """(regex, family) pairs of the normalize_os_family case() in order."""
    text = open(MACROS).read()
    body = re.search(r"^\[normalize_os_family\(1\)\]\n(.*?)(?=^\[|\Z)", text, re.S | re.M).group(1)
    return [(m.group(1), m.group(2)) for m in re.finditer(r'match\(\$os\$, "([^"]+)"\), "([^"]+)"', body)]


def normalize_os_family(value):
    if not value.strip():
        return value
    for pattern, result in _os_family_rules():
        if re.search(pattern, value):
            return result
    return "Other"


def test_normalize_os_family_known_values():
    cases = {
        "Windows Server 2019": "Windows Server", "windows_server": "Windows Server", "Windows2016": "Windows Server",
        "Win Server 2012 R2": "Windows Server", "Windows 11": "Windows Desktop", "windows_10": "Windows Desktop",
        "Windows 7 Professional": "Windows Desktop", "WinXP": "Windows Desktop",
        "Ubuntu 22.04": "Linux", "linux_redhat": "Linux", "Red Hat Enterprise Linux 9": "Linux", "CentOS 7": "Linux",
        "SUSE Linux": "Linux", "Debian 12": "Linux", "Rocky Linux": "Linux",
        "macOS Sonoma": "Mac", "Mac OS X": "Mac", "OS X 10.15 Catalina": "Mac", "Darwin 23": "Mac", "MacBook Pro": "Mac", "mac": "Mac",
        "iOS 16.1": "iOS", "iPhone OS": "iOS", "ios": "iOS", "ios_15": "iOS", "iPadOS 17": "iPadOS",
        "Android 14": "Android", "android": "Android",
        "VMware ESXi": "Hypervisor", "AIX 7.2": "Unix", "Solaris 11": "Unix",
        "Cisco IOS XE": "Network device", "IOS-XE 17": "Network device", "F5 BIG-IP": "Network device", "Cisco ASA": "Network device", "FortiOS": "Network device",
        "Plan 9": "Other", "radios": "Other", "bios 2.1": "Other", "machine": "Other", "": "",
    }
    for raw, expected in cases.items():
        assert normalize_os_family(raw) == expected, raw



def test_normalize_macros_have_balanced_parentheses():
    # the rule tests above only read the match() pairs, so a missing closing parenthesis would go unnoticed
    text = open(MACROS).read()
    for stanza in re.findall(r"^\[(normalize_[a-z_]+\(1\))\]", text, re.M):
        body = re.search(r"^\[%s\]\n(.*?)(?=^\[|\Z)" % re.escape(stanza), text, re.S | re.M).group(1)
        definition = re.search(r"^definition\s*=\s*(.*?)^iseval", body, re.S | re.M).group(1).replace("\\\n", "\n")
        definition = re.sub(r'"(?:[^"\\]|\\.)*"', '""', definition)  # drop string literals (regexes contain parentheses)
        assert definition.count("(") == definition.count(")"), stanza
